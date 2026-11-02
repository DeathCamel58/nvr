package cameraevents

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nvr/backend/internal/domain"
	"github.com/nvr/backend/internal/repository/postgres"
	"github.com/rs/zerolog/log"
)

// reconcileInterval — как часто проверять список камер и их настройки.
//
// Тридцать секунд — компромисс: изменение настройки в интерфейсе должно
// примениться без перезапуска сервера, но опрос всех камер чаще создавал
// бы лишние обращения к базе. Сами источники работают непрерывно.
const reconcileInterval = 30 * time.Second

// dedupWindow — сколько хранить отметки отправленных событий.
//
// Дольше максимального интервала склейки (3600 секунд), иначе запись
// исчезла бы раньше, чем перестала быть нужной.
const dedupWindow = 2 * time.Hour

// Manager запускает и останавливает источники событий по настройкам камер.
type Manager struct {
	repo *postgres.CameraRepo
	pub  Publisher

	mu      sync.Mutex
	workers map[uuid.UUID]*worker
	// lastSent — время последней отправки по ключу «камера/класс/место».
	// Камеры присылают детекции несколько раз в секунду; без склейки
	// журнал заполнялся бы одинаковыми записями об одном человеке.
	lastSent map[string]time.Time
}

type worker struct {
	cancel    context.CancelFunc
	signature string
}

func NewManager(repo *postgres.CameraRepo, pub Publisher) *Manager {
	return &Manager{
		repo:     repo,
		pub:      pub,
		workers:  make(map[uuid.UUID]*worker),
		lastSent: make(map[string]time.Time),
	}
}

// Start работает до отмены ctx, сверяя запущенные источники с базой.
func (m *Manager) Start(ctx context.Context) {
	m.reconcile(ctx)

	ticker := time.NewTicker(reconcileInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			m.stopAll()
			return
		case <-ticker.C:
			m.reconcile(ctx)
		}
	}
}

// reconcile приводит работающие источники в соответствие с настройками.
func (m *Manager) reconcile(ctx context.Context) {
	cameras, err := m.repo.List(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("камерные события: не удалось получить список камер")
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Сначала останавливаем то, что больше не нужно: выключенную камеру,
	// снятую настройку или изменившийся источник.
	active := make(map[uuid.UUID]bool, len(cameras))
	for _, cam := range cameras {
		settings := settingsFor(cam)
		if !cam.Enabled || !settings.Enabled || cam.IP == "" {
			m.stopLocked(cam.ID)
			continue
		}
		active[cam.ID] = true

		sig := signature(cam, settings)
		if w, ok := m.workers[cam.ID]; ok {
			if w.signature == sig {
				continue
			}
			// Настройки изменились — перезапускаем источник, чтобы не
			// держать в памяти прежние фильтры классов.
			m.stopLocked(cam.ID)
		}
		m.startLocked(ctx, cam, settings, sig)
	}

	for id := range m.workers {
		if !active[id] {
			m.stopLocked(id)
		}
	}

	m.pruneDedupLocked()
}

func signature(cam domain.Camera, s domain.CameraEventsSettings) string {
	user, pass := credentials(cam.Settings)
	// Учётные данные входят в подпись: после смены пароля источник должен
	// переподключиться. Без этого он держал бы старое соединение до обрыва,
	// а новый пароль применялся бы только после перезапуска сервера.
	return fmt.Sprintf("%s|%s|%s|%s|%t|%t|%d", cam.IP, user, pass, s.Source, s.Motion, s.Objects, s.MinIntervalSec)
}

func (m *Manager) startLocked(parent context.Context, cam domain.Camera, settings domain.CameraEventsSettings, sig string) {
	ctx, cancel := context.WithCancel(parent)
	m.workers[cam.ID] = &worker{cancel: cancel, signature: sig}

	go func() {
		defer func() {
			m.mu.Lock()
			// Удаляем только свой воркер: за время работы его могли заменить
			// на другой экземпляр с новыми настройками.
			if w, ok := m.workers[cam.ID]; ok && w.signature == sig {
				delete(m.workers, cam.ID)
			}
			m.mu.Unlock()
		}()
		m.run(ctx, cam, settings)
	}()

	log.Info().Str("camera", cam.Name).Str("ip", cam.IP).
		Str("source", settings.Source).Msg("камерные события: источник запущен")
}

// run держит источник подключённым, повторяя попытки с растущей паузой.
func (m *Manager) run(ctx context.Context, cam domain.Camera, settings domain.CameraEventsSettings) {
	backoff := 2 * time.Second
	for {
		if ctx.Err() != nil {
			return
		}

		src, err := newSource(ctx, cam, settings)
		if err != nil {
			log.Warn().Err(err).Str("camera", cam.Name).Str("source", settings.Source).
				Msg("камерные события: источник недоступен, повтор через паузу")
			if !sleepCtx(ctx, backoff) {
				return
			}
			backoff = nextBackoff(backoff)
			continue
		}

		log.Info().Str("camera", cam.Name).Str("source", src.Name()).
			Msg("камерные события: подключение установлено")
		backoff = 2 * time.Second

		err = src.Run(ctx, func(ev Event) error {
			return m.emit(cam, settings, src.Name(), ev)
		})
		if ctx.Err() != nil {
			return
		}
		log.Warn().Err(err).Str("camera", cam.Name).Str("source", src.Name()).
			Msg("камерные события: связь с источником потеряна")

		if !sleepCtx(ctx, backoff) {
			return
		}
		backoff = nextBackoff(backoff)
	}
}

func nextBackoff(d time.Duration) time.Duration {
	d *= 2
	if d > time.Minute {
		return time.Minute
	}
	return d
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// emit проверяет настройки, склеивает повторы и публикует событие.
func (m *Manager) emit(cam domain.Camera, settings domain.CameraEventsSettings, source string, ev Event) error {
	if ev.ObjectClass == "" {
		return nil
	}
	if ev.ObjectClass == "motion" && !settings.Motion {
		return nil
	}
	if ev.ObjectClass != "motion" && !settings.Objects {
		return nil
	}

	ev.CameraID = cam.ID.String()
	if ev.Timestamp == 0 {
		ev.Timestamp = eventTime(time.Time{})
	}
	if ev.Metadata == nil {
		ev.Metadata = make(map[string]any)
	}
	ev.Metadata["native"] = true
	ev.Metadata["source"] = source

	// Ключ склейки: класс и место в кадре, округлённое до десятой доли.
	// Один человек, идущий через двор, остаётся в одной клетке несколько
	// секунд, и повторные события о нём не нужны.
	key := fmt.Sprintf("%s|%s|%.1f|%.1f", cam.ID, ev.ObjectClass,
		ev.BBox["x"]*10, ev.BBox["y"]*10)

	now := time.Now()
	m.mu.Lock()
	if last, ok := m.lastSent[key]; ok && now.Sub(last) < time.Duration(settings.MinIntervalSec)*time.Second {
		m.mu.Unlock()
		return nil
	}
	m.lastSent[key] = now
	m.mu.Unlock()

	data, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("не удалось собрать событие: %w", err)
	}
	if err := m.pub.Publish("cameras."+ev.CameraID+".detection", data); err != nil {
		// Событие уже отмечено отправленным; повтор через минуту после
		// обрыва NATS лучше, чем шторм повторов при каждом кадре.
		return fmt.Errorf("не удалось отправить событие в шину: %w", err)
	}

	log.Debug().Str("camera", cam.Name).Str("class", ev.ObjectClass).
		Str("source", source).Msg("камерное событие отправлено")
	return nil
}

func (m *Manager) stopLocked(id uuid.UUID) {
	if w, ok := m.workers[id]; ok {
		w.cancel()
		delete(m.workers, id)
	}
}

func (m *Manager) stopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id := range m.workers {
		m.stopLocked(id)
	}
}

// pruneDedupLocked убирает старые отметки, чтобы карта не росла бесконечно.
func (m *Manager) pruneDedupLocked() {
	cutoff := time.Now().Add(-dedupWindow)
	for k, at := range m.lastSent {
		if at.Before(cutoff) {
			delete(m.lastSent, k)
		}
	}
}
