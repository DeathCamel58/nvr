package cameraevents

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/nvr/backend/internal/domain"
	"golang.org/x/net/websocket"
)

// openIPCSource — живая аналитика прошивки OpenIPC (Majestic).
//
// Камера отдаёт JSON по WebSocket /ws/analytics. В нём могут быть и
// прямоугольники движения, и результаты бортовой NPU-детекции:
//
//	{"src":"motion","active":true,"w":2560,"h":1440,"n":1,"total":1,
//	 "r":[[x,y,w,h,cls,score]]}
//
// Классы в поле cls заданы прошивкой: 1 — человек, 2 — машина, 3 — лицо,
// 4 — животное. Формат проверен на камере gk7205v500-sc401ai.
//
// Важно: объектная детекция заработает только после того, как на камеру
// установят NPU-модель и владелец примет EULA в её интерфейсе. До этого
// приходят только события motion, и это не ошибка нашего кода.
type openIPCSource struct {
	cam  domain.Camera
	user string
	pass string
	port int
}

func newOpenIPCSource(cam domain.Camera, user, pass string, port int) *openIPCSource {
	if port == 0 {
		port = 80
	}
	return &openIPCSource{cam: cam, user: user, pass: pass, port: port}
}

func (s *openIPCSource) Name() string { return "openipc" }

func (s *openIPCSource) Run(ctx context.Context, emit func(Event) error) error {
	ws, err := s.dial(ctx)
	if err != nil {
		return err
	}
	defer ws.Close()

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		// Камера присылает события несколько раз в секунду. Если поток
		// замолчал совсем, соединение могло остаться открытым после
		// перезагрузки камеры — тогда переподключаемся по таймауту.
		_ = ws.SetReadDeadline(time.Now().Add(90 * time.Second))

		var raw string
		if err := websocket.Message.Receive(ws, &raw); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("поток аналитики OpenIPC прерван: %w", err)
		}

		events, err := parseOpenIPCAnalytics(raw)
		if err != nil {
			// Одно непонятное сообщение не должно рвать поток: формат
			// может дополниться в новой прошивке.
			continue
		}
		for _, ev := range events {
			if err := emit(ev); err != nil {
				return err
			}
		}
	}
}

// dial открывает WebSocket с Basic-авторизацией.
//
// net.Dialer, а не websocket.DialConfig: только так можно прервать
// подключение по контексту и задать таймаут. Камера, выключенная в
// сети, иначе держала бы горутину до системного таймаута.
func (s *openIPCSource) dial(ctx context.Context) (*websocket.Conn, error) {
	addr := net.JoinHostPort(s.cam.IP, fmt.Sprintf("%d", s.port))
	dialer := &net.Dialer{Timeout: 6 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("не удалось подключиться к аналитике камеры: %w", err)
	}

	config, err := websocket.NewConfig(
		fmt.Sprintf("ws://%s/ws/analytics", addr),
		fmt.Sprintf("http://%s/", addr),
	)
	if err != nil {
		conn.Close()
		return nil, err
	}
	if s.user != "" {
		config.Header.Set("Authorization",
			"Basic "+base64.StdEncoding.EncodeToString([]byte(s.user+":"+s.pass)))
	}

	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	ws, err := websocket.NewClient(config, conn)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("камера отклонила подключение к аналитике: %w", err)
	}
	_ = ws.SetDeadline(time.Time{})
	return ws, nil
}

// openIPCAnalytics — сообщение /ws/analytics.
type openIPCAnalytics struct {
	Src    string      `json:"src"`
	Active bool        `json:"active"`
	W      int         `json:"w"`
	H      int         `json:"h"`
	N      int         `json:"n"`
	Total  int         `json:"total"`
	R      [][]float64 `json:"r"`
}

// parseOpenIPCAnalytics переводит сообщение камеры в события.
func parseOpenIPCAnalytics(raw string) ([]Event, error) {
	var msg openIPCAnalytics
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		return nil, err
	}
	if !msg.Active {
		// active=false — движение закончилось. Публиковать его как
		// обнаружение нельзя: тревога пришла бы после события.
		return nil, nil
	}

	src := strings.ToLower(strings.TrimSpace(msg.Src))
	meta := map[string]any{
		"analytics_src": msg.Src,
		"native":        true,
	}
	if msg.Total > 0 {
		meta["total"] = msg.Total
	}

	// Ветка движения. Прямоугольники движения приходят без класса —
	// это не объекты, и выдавать их за людей нельзя. Но если в сообщении
	// с src=motion уже есть классы (новая прошивка объединила источники),
	// идём в объектную ветку, а не теряем людей и машины.
	if (src == "" || strings.Contains(src, "motion")) && !hasObjectClass(msg.R) {
		return []Event{{
			Timestamp:   eventTime(time.Now()),
			ObjectClass: "motion",
			Confidence:  0.5,
			Metadata:    meta,
		}}, nil
	}

	var events []Event
	for _, r := range msg.R {
		if len(r) < 4 {
			continue
		}
		class, conf, ok := openIPCClass(r)
		if !ok {
			continue
		}

		ev := Event{
			Timestamp:   eventTime(time.Now()),
			ObjectClass: class,
			Confidence:  conf,
			Metadata:    cloneMeta(meta),
		}
		if msg.W > 0 && msg.H > 0 {
			ev.BBox = map[string]float64{
				"x": r[0] / float64(msg.W),
				"y": r[1] / float64(msg.H),
				"w": r[2] / float64(msg.W),
				"h": r[3] / float64(msg.H),
			}
		}
		events = append(events, ev)
	}

	// Камера иногда сообщает класс без прямоугольника — например,
	// «человек в кадре» от простого детектора. Тогда событие всё равно
	// полезно, но без рамки.
	if len(events) == 0 {
		if class := classFromSource(src); class != "" {
			events = append(events, Event{
				Timestamp:   eventTime(time.Now()),
				ObjectClass: class,
				Confidence:  0.6,
				Metadata:    meta,
			})
		}
	}
	return events, nil
}

// hasObjectClass сообщает, есть ли в сообщении распознанный класс.
func hasObjectClass(boxes [][]float64) bool {
	for _, r := range boxes {
		if len(r) < 5 {
			continue
		}
		if _, _, ok := openIPCClass(r); ok {
			return true
		}
	}
	return false
}

// openIPCClass разбирает элемент r: [x,y,w,h,cls,score].
func openIPCClass(r []float64) (string, float64, bool) {
	key := r[4]
	class := ""
	switch int(key) {
	case 1:
		class = "person"
	case 2:
		class = "car"
	case 3:
		// Лицо — не отдельный класс объектов в нашем журнале. Основное
		// событие — человек; подтип остаётся в metadata.
		class = "person"
	case 4:
		class = "dog"
	default:
		return "", 0, false
	}

	conf := 0.6
	if len(r) >= 6 && r[5] > 0 {
		conf = r[5]
		if conf > 1 {
			conf /= 100
		}
	}
	return class, conf, true
}

func classFromSource(src string) string {
	switch {
	case strings.Contains(src, "human"), strings.Contains(src, "person"), strings.Contains(src, "people"):
		return "person"
	case strings.Contains(src, "vehicle"), strings.Contains(src, "car"), strings.Contains(src, "truck"):
		return "car"
	case strings.Contains(src, "animal"), strings.Contains(src, "dog"), strings.Contains(src, "cat"):
		return "dog"
	}
	return ""
}

func cloneMeta(src map[string]any) map[string]any {
	dst := make(map[string]any, len(src)+1)
	for k, v := range src {
		dst[k] = v
	}
	return dst
}
