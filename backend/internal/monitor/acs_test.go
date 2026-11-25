package monitor

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/nvr/backend/internal/domain"
)

// stubACS отдаёт контроллеры СКУД из памяти.
type stubACS struct {
	items []ACSController
}

func (s *stubACS) ListACS(context.Context) ([]ACSController, error) {
	return s.items, nil
}

// TestACSOfflineAtStartupIsReported: контроллер был офлайн уже при первой
// проверке — сообщаем сразу, без выдержки. Раньше о такой двери узнавали
// только при попытке её открыть.
func TestACSOfflineAtStartupIsReported(t *testing.T) {
	ctrlID := uuid.New()
	acs := &stubACS{items: []ACSController{{
		ID: ctrlID, Name: "Z5R (вход)", IP: "192.168.1.60", Status: "offline",
	}}}
	reporter := &recordingReporter{}

	m := NewMonitor(&stubCameras{}, &stubSettings{cfg: enabledCfg()},
		&stubSystem{}, &stubHardware{hw: &Hardware{}}, reporter).WithACS(acs)
	m.checkOnce(context.Background())

	if n := reporter.countType(domain.SystemTriggerACSOffline); n != 1 {
		t.Fatalf("не сообщено об отключённом контроллере: %d", n)
	}
	for _, ev := range reporter.all() {
		if ev.Type == domain.SystemTriggerACSOffline && ev.Key != acsKey(ctrlID.String()) {
			t.Fatalf("ключ события не совпадает: %q", ev.Key)
		}
	}
}

// TestACSTwoControllersReportedSeparately: два отключённых устройства дают
// два сообщения — иначе оператор не знает, какая именно дверь мертва.
func TestACSTwoControllersReportedSeparately(t *testing.T) {
	acs := &stubACS{items: []ACSController{
		{ID: uuid.New(), Name: "Z5R (вход)", IP: "192.168.1.60", Status: "offline"},
		{ID: uuid.New(), Name: "SKUD-01", IP: "192.168.1.247", Status: "offline"},
	}}
	reporter := &recordingReporter{}

	m := NewMonitor(&stubCameras{}, &stubSettings{cfg: enabledCfg()},
		&stubSystem{}, &stubHardware{hw: &Hardware{}}, reporter).WithACS(acs)
	m.checkOnce(context.Background())

	if n := reporter.countType(domain.SystemTriggerACSOffline); n != 2 {
		t.Fatalf("ожидали два сообщения о контроллерах, получили %d", n)
	}
}

// TestACSOfflineNotRepeated: держащаяся проблема не повторяется на каждой
// проверке — иначе журнал и мессенджер забиваются одним и тем же.
func TestACSOfflineNotRepeated(t *testing.T) {
	acs := &stubACS{items: []ACSController{{
		ID: uuid.New(), Name: "Z5R", IP: "192.168.1.60", Status: "offline",
	}}}
	reporter := &recordingReporter{}

	m := NewMonitor(&stubCameras{}, &stubSettings{cfg: enabledCfg()},
		&stubSystem{}, &stubHardware{hw: &Hardware{}}, reporter).WithACS(acs)
	m.checkOnce(context.Background())
	m.checkOnce(context.Background())

	if n := reporter.countType(domain.SystemTriggerACSOffline); n != 1 {
		t.Fatalf("повтор о неустранённой проблеме: %d сообщений", n)
	}
}

// TestACSRecoveryReported: о восстановлении сообщаем, но только если о
// проблеме уже сообщали.
func TestACSRecoveryReported(t *testing.T) {
	ctrlID := uuid.New()
	acs := &stubACS{items: []ACSController{{
		ID: ctrlID, Name: "Z5R", IP: "192.168.1.60", Status: "offline",
	}}}
	reporter := &recordingReporter{}

	m := NewMonitor(&stubCameras{}, &stubSettings{cfg: enabledCfg()},
		&stubSystem{}, &stubHardware{hw: &Hardware{}}, reporter).WithACS(acs)
	m.checkOnce(context.Background())

	acs.items[0].Status = "online"
	m.checkOnce(context.Background())

	// resolve отправляет событие того же типа с Resolved=true; считаем
	// отдельно, чтобы не путать с самой тревогой.
	resolved := 0
	for _, ev := range reporter.all() {
		if ev.Key == acsKey(ctrlID.String()) && ev.Resolved {
			resolved++
		}
	}
	if resolved != 1 {
		t.Fatalf("не сообщено о восстановлении контроллера: %d", resolved)
	}
}

// TestACSOnlineAtStartupIsSilent: контроллер в сети — молчим.
func TestACSOnlineAtStartupIsSilent(t *testing.T) {
	acs := &stubACS{items: []ACSController{{
		ID: uuid.New(), Name: "Z5R", IP: "192.168.1.62", Status: "online",
	}}}
	reporter := &recordingReporter{}

	m := NewMonitor(&stubCameras{}, &stubSettings{cfg: enabledCfg()},
		&stubSystem{}, &stubHardware{hw: &Hardware{}}, reporter).WithACS(acs)
	m.checkOnce(context.Background())

	if n := reporter.countType(domain.SystemTriggerACSOffline); n != 0 {
		t.Fatalf("сообщение о контроллере, который в сети: %d", n)
	}
}

// TestACSHoldDelaysReport: с выдержкой сообщение не приходит сразу.
func TestACSHoldDelaysReport(t *testing.T) {
	cfg := enabledCfg()
	cfg.Thresholds.CameraOfflineMinutes = 5

	ctrlID := uuid.New()
	acs := &stubACS{items: []ACSController{{
		ID: ctrlID, Name: "Z5R", IP: "192.168.1.60", Status: "online",
	}}}
	reporter := &recordingReporter{}
	m := NewMonitor(&stubCameras{}, &stubSettings{cfg: cfg},
		&stubSystem{}, &stubHardware{hw: &Hardware{}}, reporter).WithACS(acs)

	// Первая проверка: в сети, запоминаем состояние.
	m.checkOnce(context.Background())

	// Пропал: отсчёт начался, но выдержка не набрана.
	acs.items[0].Status = "offline"
	m.checkOnce(context.Background())
	if n := reporter.countType(domain.SystemTriggerACSOffline); n != 0 {
		t.Fatalf("сообщение пришло раньше выдержки: %d", n)
	}

	// Состарим отметку вручную — ждать пять минут в тесте незачем.
	m.acsOfflineSince[ctrlID] = time.Now().Add(-6 * time.Minute)
	m.checkOnce(context.Background())
	if n := reporter.countType(domain.SystemTriggerACSOffline); n != 1 {
		t.Fatalf("после выдержки сообщения нет: %d", n)
	}
}
