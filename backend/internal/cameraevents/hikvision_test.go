package cameraevents

import "testing"

func TestParseHikvisionAlertMotion(t *testing.T) {
	raw := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<ipAddress>192.168.1.55</ipAddress>
<dateTime>2026-11-02T14:00:00+03:00</dateTime>
<channelID>1</channelID>
<eventType>VMD</eventType>
<eventState>active</eventState>
<eventDescription>VMD alarm</eventDescription>
</EventNotificationAlert>`)

	ev, ok := parseHikvisionAlert(raw)
	if !ok {
		t.Fatal("событие VMD не распознано")
	}
	if ev.ObjectClass != "motion" {
		t.Fatalf("класс = %q, ожидался motion", ev.ObjectClass)
	}
	if ev.Metadata["event_type"] != "vmd" {
		t.Fatalf("тип события в metadata = %v", ev.Metadata["event_type"])
	}
}

func TestParseHikvisionAlertLineHuman(t *testing.T) {
	raw := []byte(`<EventNotificationAlert><eventType>linedetection</eventType>
<eventState>active</eventState><detectionTarget>human</detectionTarget>
<dateTime>2026-11-02T14:00:00+03:00</dateTime></EventNotificationAlert>`)

	ev, ok := parseHikvisionAlert(raw)
	if !ok {
		t.Fatal("событие пересечения линии не распознано")
	}
	if ev.ObjectClass != "person" {
		t.Fatalf("класс = %q, ожидался person", ev.ObjectClass)
	}
	if ev.Confidence != 0.9 {
		t.Fatalf("уверенность = %v, ожидалось 0.9", ev.Confidence)
	}
}

func TestParseHikvisionAlertIgnoresInactive(t *testing.T) {
	raw := []byte(`<EventNotificationAlert><eventType>linedetection</eventType>
<eventState>inactive</eventState><detectionTarget>human</detectionTarget></EventNotificationAlert>`)

	if _, ok := parseHikvisionAlert(raw); ok {
		t.Fatal("окончание события не должно публиковаться как обнаружение")
	}
}

func TestParseHikvisionAlertIgnoresVideoLoss(t *testing.T) {
	raw := []byte(`<EventNotificationAlert><eventType>videoloss</eventType>
<eventState>inactive</eventState></EventNotificationAlert>`)

	if _, ok := parseHikvisionAlert(raw); ok {
		t.Fatal("videoloss не является событием обнаружения объекта")
	}
}

func TestHikClassVehicle(t *testing.T) {
	class, ok := hikClass("fielddetection", "vehicle", "", "")
	if !ok || class != "car" {
		t.Fatalf("получено %q, %v; ожидался car", class, ok)
	}
}

func TestParseHikvisionAlertNestedTarget(t *testing.T) {
	// На части прошивок цель лежит внутри Extensions. Раньше такой
	// документ давал motion, то есть терял человека.
	raw := []byte(`<EventNotificationAlert>
<eventType>linedetection</eventType>
<eventState>active</eventState>
<Extensions><EventNotification><detectionTarget>human</detectionTarget></EventNotification></Extensions>
</EventNotificationAlert>`)

	ev, ok := parseHikvisionAlert(raw)
	if !ok {
		t.Fatal("вложенное событие линии не распознано")
	}
	if ev.ObjectClass != "person" {
		t.Fatalf("класс = %q, ожидался person", ev.ObjectClass)
	}
}
