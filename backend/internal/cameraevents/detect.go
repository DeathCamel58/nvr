package cameraevents

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/nvr/backend/internal/domain"
	"github.com/nvr/backend/internal/httpdigest"
)

// newSource выбирает протокол и создаёт источник.
//
// Явно заданный источник не проверяется пробой: оператор мог выбрать его
// намеренно, и ошибка подключения должна быть видна в журнале, а не
// приводить к тихой подмене другим протоколом. Для auto порядок важен:
// OpenIPC отвечает своим API, Hikvision — ISAPI, и только потом пробуем
// общий ONVIF. У Hikvision ONVIF-служба событий отвечает отказом
// авторизации, поэтому до неё дело доходить не должно.
func newSource(ctx context.Context, cam domain.Camera, settings domain.CameraEventsSettings) (Source, error) {
	user, pass := credentials(cam.Settings)

	switch settings.Source {
	case "openipc":
		return newOpenIPCSource(cam, user, pass, 0), nil
	case "hikvision":
		return newHikvisionSource(cam, user, pass), nil
	case "onvif":
		return newONVIFSource(cam, user, pass), nil
	case "", "auto":
	default:
		return nil, fmt.Errorf("неизвестный источник событий: %s", settings.Source)
	}

	if isOpenIPC(ctx, cam, user, pass) {
		return newOpenIPCSource(cam, user, pass, 0), nil
	}
	if isHikvision(ctx, cam, user, pass) {
		return newHikvisionSource(cam, user, pass), nil
	}
	src := newONVIFSource(cam, user, pass)
	if err := src.probe(ctx); err == nil {
		return src, nil
	} else {
		return nil, fmt.Errorf("камера не сообщила поддерживаемый источник событий: %w", err)
	}
}

// isOpenIPC проверяет фирменный API Majestic.
//
// Признак — не просто ответ 200: веб-интерфейс OpenIPC отдаёт страницу на
// любой путь, а конфигурацию — только настоящий Majestic. Поэтому читаем
// JSON и ищем в нём разделы детекции.
func isOpenIPC(ctx context.Context, cam domain.Camera, user, pass string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+cam.IP+"/api/v1/config.json", nil)
	if err != nil {
		return false
	}
	if user != "" {
		req.SetBasicAuth(user, pass)
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return false
	}
	var cfg map[string]json.RawMessage
	if json.Unmarshal(raw, &cfg) != nil {
		return false
	}
	_, motion := cfg["motionDetect"]
	_, objects := cfg["objectDetect"]
	return motion || objects
}

// isHikvision проверяет ISAPI. Авторизация — HTTP Digest, как и у
// остальных обращений к Hikvision в этом проекте.
func isHikvision(ctx context.Context, cam domain.Camera, user, pass string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+cam.IP+"/ISAPI/System/deviceInfo", nil)
	if err != nil {
		return false
	}
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := httpdigest.Do(client, req, user, pass)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return false
	}
	return strings.Contains(string(raw), "<DeviceInfo") ||
		strings.Contains(string(raw), "hikvision.com")
}
