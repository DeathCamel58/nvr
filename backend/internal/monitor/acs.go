package monitor

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/nvr/backend/internal/domain"
)

// ACSController — сведения о контроллере СКУД, нужные мониторингу.
type ACSController struct {
	ID     uuid.UUID
	Name   string
	IP     string
	Status string
}

// ACSSource отдаёт список контроллеров СКУД.
//
// Отдельный интерфейс, а не общий с камерами: у контроллеров своя таблица
// и свой признак связи. Без него про отключённый контроллер узнавали
// только при попытке открыть дверь — то есть постфактум, когда человек
// уже стоит перед запертой калиткой.
type ACSSource interface {
	ListACS(ctx context.Context) ([]ACSController, error)
}

// WithACS подключает проверку доступности контроллеров СКУД.
// Без него проверка выключена — так установки без СКУД работают как раньше.
func (m *Monitor) WithACS(src ACSSource) *Monitor {
	m.acs = src
	return m
}

// acsKey строит ключ проблемы для контроллера.
//
// Префикс свой, а не общий с камерами: иначе идентификаторы двух разных
// таблиц в одном пространстве ключей могли бы заглушить друг друга.
func acsKey(id string) string {
	return "acs:" + id
}

// checkACS проверяет доступность контроллеров СКУД.
//
// Правила те же, что у камер: о пропаже сообщаем после выдержки, повторов
// нет, о восстановлении — отдельно. Ключ у каждого контроллера свой,
// поэтому два отключённых устройства дают два сообщения, а не одно.
func (m *Monitor) checkACS(ctx context.Context, settings domain.SystemConfig) {
	if m.acs == nil {
		return
	}

	controllers, err := m.acs.ListACS(ctx)
	if err != nil {
		// Недоступная база не должна превращаться в поток ложных тревог
		// о контроллерах: молчим, как и проверка камер при сбое списка.
		return
	}

	hold := time.Duration(settings.Thresholds.CameraOfflineMinutes) * time.Minute

	for _, ctrl := range controllers {
		online := ctrl.Status != "offline"
		prev, seen := m.lastACSOnline[ctrl.ID]
		m.lastACSOnline[ctrl.ID] = online

		key := acsKey(ctrl.ID.String())

		if online {
			delete(m.acsOfflineSince, ctrl.ID)
			// О восстановлении сообщаем, только если о проблеме сообщали.
			if seen && !prev {
				// Тип system_acs_online: упоминание «восстановил
				// соединение» дублировало бы заголовок, и оператор
				// видел бы одно и то же слово дважды.
				m.resolve(ctx, key, "Контроллер СКУД снова на связи",
					fmt.Sprintf("%s (%s)", ctrl.Name, ctrl.IP), settings)
			} else {
				m.forget(key)
			}
			continue
		}

		since, exists := m.acsOfflineSince[ctrl.ID]
		if !exists {
			m.acsOfflineSince[ctrl.ID] = time.Now()

			// Как и у камер: контроллер был офлайн уже при первой
			// проверке — проблема сложилась до запуска сервера, ждать
			// выдержку незачем.
			if !seen {
				m.reportACSOffline(ctx, ctrl, 0, settings)
			}
			continue
		}

		if hold > 0 && time.Since(since) < hold {
			continue
		}

		if !m.markActive(key) {
			continue
		}
		m.reportACSOffline(ctx, ctrl, hold, settings)
	}
}

// reportACSOffline отправляет сообщение о недоступном контроллере.
func (m *Monitor) reportACSOffline(ctx context.Context, ctrl ACSController,
	hold time.Duration, settings domain.SystemConfig) {
	detail := fmt.Sprintf("Контроллер «%s» (%s) недоступен", ctrl.Name, ctrl.IP)
	if hold > 0 {
		detail += fmt.Sprintf(" более %d мин", int(hold.Minutes()))
	}

	m.report(ctx, SystemEvent{
		Type:     domain.SystemTriggerACSOffline,
		Title:    "Контроллер СКУД пропал из сети",
		Detail:   detail,
		Severity: "critical",
		Key:      acsKey(ctrl.ID.String()),
	}, settings)
}
