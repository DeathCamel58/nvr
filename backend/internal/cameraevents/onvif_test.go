package cameraevents

import (
	"testing"
	"time"
)

func TestParseONVIFNotificationsMotion(t *testing.T) {
	raw := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope"
 xmlns:tev="http://www.onvif.org/ver10/events/wsdl"
 xmlns:wsnt="http://docs.oasis-open.org/wsn/b-2"
 xmlns:tt="http://www.onvif.org/ver10/schema">
 <SOAP-ENV:Body>
  <tev:PullMessagesResponse>
   <wsnt:NotificationMessage>
    <wsnt:Topic>tns1:VideoSource/MotionAlarm</wsnt:Topic>
    <wsnt:Message>
     <tt:Message UtcTime="2026-11-02T14:00:00Z">
      <tt:Source><tt:SimpleItem Name="Source" Value="VideoSource_1"/></tt:Source>
      <tt:Data><tt:SimpleItem Name="State" Value="true"/></tt:Data>
     </tt:Message>
    </wsnt:Message>
   </wsnt:NotificationMessage>
  </tev:PullMessagesResponse>
 </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`)

	notifications, err := parseONVIFNotifications(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(notifications) != 1 {
		t.Fatalf("получено %d уведомлений, ожидалось 1", len(notifications))
	}
	ev, ok := notifications[0].toEvent()
	if !ok {
		t.Fatal("событие движения не распознано")
	}
	if ev.ObjectClass != "motion" {
		t.Fatalf("класс = %q, ожидался motion", ev.ObjectClass)
	}
	want := float64(time.Date(2026, 11, 2, 14, 0, 0, 0, time.UTC).Unix())
	if ev.Timestamp != want {
		t.Fatalf("время = %v, ожидалось %v", ev.Timestamp, want)
	}
}

func TestParseONVIFNotificationsIgnoresInactive(t *testing.T) {
	raw := []byte(`<Envelope><Body><PullMessagesResponse>
<NotificationMessage><Topic>tns1:RuleEngine/CellMotionDetector/Motion</Topic>
<Message><Message UtcTime="2026-11-02T14:00:00Z"><Data>
<SimpleItem Name="IsMotion" Value="false"/></Data></Message></Message>
</NotificationMessage></PullMessagesResponse></Body></Envelope>`)

	notifications, err := parseONVIFNotifications(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(notifications) != 1 {
		t.Fatalf("получено %d уведомлений, ожидалось 1", len(notifications))
	}
	if _, ok := notifications[0].toEvent(); ok {
		t.Fatal("окончание движения не должно становиться событием")
	}
}

func TestParseOpenIPCAnalyticsMotion(t *testing.T) {
	events, err := parseOpenIPCAnalytics(`{"src":"motion","active":true,"w":0,"h":0,"n":0,"total":0,"r":[]}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(events) != 1 || events[0].ObjectClass != "motion" {
		t.Fatalf("ожидалось одно событие motion, получено %+v", events)
	}
}

func TestParseOpenIPCAnalyticsPerson(t *testing.T) {
	events, err := parseOpenIPCAnalytics(`{"src":"object","active":true,"w":1000,"h":500,"r":[[100,50,200,100,1,0.87]]}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("получено %d событий, ожидалось 1", len(events))
	}
	ev := events[0]
	if ev.ObjectClass != "person" {
		t.Fatalf("класс = %q, ожидался person", ev.ObjectClass)
	}
	if ev.Confidence != 0.87 {
		t.Fatalf("уверенность = %v, ожидалось 0.87", ev.Confidence)
	}
	if ev.BBox["x"] != 0.1 || ev.BBox["w"] != 0.2 {
		t.Fatalf("рамка нормализована неверно: %+v", ev.BBox)
	}
}

func TestParseOpenIPCAnalyticsInactive(t *testing.T) {
	events, err := parseOpenIPCAnalytics(`{"src":"motion","active":false,"r":[]}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("окончание движения не должно давать событие, получено %+v", events)
	}
}

func TestParseOpenIPCAnalyticsMotionWithObjectClass(t *testing.T) {
	// Новая прошивка может объединить источники: src=motion, но в рамке
	// уже есть класс. Такое сообщение должно дать человека, а не motion.
	events, err := parseOpenIPCAnalytics(`{"src":"motion","active":true,"w":1000,"h":500,"r":[[100,50,200,100,1,0.9]]}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(events) != 1 || events[0].ObjectClass != "person" {
		t.Fatalf("ожидался person, получено %+v", events)
	}
}
