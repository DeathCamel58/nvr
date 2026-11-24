package live

import (
	"testing"
)

// Поток событий раньше отдавал все события всем подписчикам: право
// events.view разрешало журнал, но не отменяло разграничение доступа к
// камерам. Тест фиксирует, что фильтр подписчика действительно отсекает
// чужие события и не мешает остальным подписчикам.
func TestSubscriberFilter(t *testing.T) {
	h := NewHub()
	defer func() { h.mu.Lock(); h.subscribers = map[*Subscriber]struct{}{}; h.mu.Unlock() }()

	limited := h.Subscribe()
	limited.WithFilter(func(ev Event) bool { return ev.CameraID == "cam-ok" })
	defer limited.Close()

	full := h.Subscribe()
	defer full.Close()

	h.Publish(Event{Type: "detection", CameraID: "cam-ok"})
	h.Publish(Event{Type: "detection", CameraID: "cam-secret"})

	if got := <-limited.Events(); got.CameraID != "cam-ok" {
		t.Fatalf("фильтр пропустил чужое событие: %+v", got)
	}
	// Второе событие фильтр отбросил: в канале не должно быть ничего.
	select {
	case got := <-limited.Events():
		t.Fatalf("фильтр не отсек событие чужой камеры: %+v", got)
	default:
	}

	// Подписчик без фильтра получает оба события.
	saw := map[string]bool{}
	for i := 0; i < 2; i++ {
		select {
		case ev := <-full.Events():
			saw[ev.CameraID] = true
		default:
			t.Fatalf("подписчик без фильтра не получил событие %d", i)
		}
	}
	if !saw["cam-ok"] || !saw["cam-secret"] {
		t.Fatalf("подписчик без фильтра получил не всё: %v", saw)
	}
}

// Событие СКУД без камеры фильтруется по контроллеру: иначе проход с
// невидимой двери протёк бы через поток в обход журнала.
func TestSubscriberFilterController(t *testing.T) {
	h := NewHub()
	sub := h.Subscribe()
	sub.WithFilter(func(ev Event) bool { return ev.ControllerID == "ctrl-ok" })
	defer sub.Close()

	h.Publish(Event{Type: "access", ControllerID: "ctrl-ok"})
	h.Publish(Event{Type: "access", ControllerID: "ctrl-secret"})

	if got := <-sub.Events(); got.ControllerID != "ctrl-ok" {
		t.Fatalf("ожидали событие своего контроллера, получили %+v", got)
	}
	select {
	case got := <-sub.Events():
		t.Fatalf("фильтр не отсек событие чужого контроллера: %+v", got)
	default:
	}
}
