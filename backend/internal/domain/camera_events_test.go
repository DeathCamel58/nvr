package domain

import "testing"

func TestCameraEventsFromSettingsDefaults(t *testing.T) {
	s := CameraEventsFromSettings(nil)
	if s.Enabled {
		t.Fatal("без настроек приём событий должен быть выключен")
	}
	if s.Source != "auto" || !s.Motion || !s.Objects {
		t.Fatalf("неверные значения по умолчанию: %+v", s)
	}
	if s.MinIntervalSec != 10 {
		t.Fatalf("интервал по умолчанию = %d, ожидался 10", s.MinIntervalSec)
	}
}

func TestCameraEventsFromSettingsMap(t *testing.T) {
	s := CameraEventsFromSettings(map[string]any{
		CameraEventsKey: map[string]any{
			"enabled":          true,
			"source":           "Hikvision",
			"motion":           false,
			"objects":          true,
			"min_interval_sec": float64(3),
		},
	})
	if !s.Enabled || s.Source != "hikvision" || s.Motion || !s.Objects || s.MinIntervalSec != 3 {
		t.Fatalf("настройки разобраны неверно: %+v", s)
	}
}

func TestValidateCameraEventsSettings(t *testing.T) {
	if err := ValidateCameraEventsSettings(NormalizeCameraEventsSettings(CameraEventsSettings{Source: "onnvif"})); err == nil {
		t.Fatal("неизвестный источник должен отклоняться")
	}
	if err := ValidateCameraEventsSettings(NormalizeCameraEventsSettings(CameraEventsSettings{Source: "openipc"})); err != nil {
		t.Fatalf("openipc должен быть допустим: %v", err)
	}
}
