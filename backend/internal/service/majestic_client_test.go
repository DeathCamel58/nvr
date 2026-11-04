package service

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// connCounter считает соединения, которые сервер видел и которые ещё открыты:
// так же эту утечку видно на самой камере — по числу дескрипторов.
type connCounter struct {
	mu      sync.Mutex
	opened  int
	current int
}

func (c *connCounter) track(_ net.Conn, state http.ConnState) {
	c.mu.Lock()
	defer c.mu.Unlock()
	switch state {
	case http.StateNew:
		c.opened++
		c.current++
	case http.StateClosed, http.StateHijacked:
		c.current--
	}
}

func (c *connCounter) snapshot() (opened, current int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.opened, c.current
}

func newCountingCamera(t *testing.T) (ip string, counter *connCounter) {
	t.Helper()
	counter = &connCounter{}
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("{}"))
	}))
	srv.Config.ConnState = counter.track
	srv.Start()
	t.Cleanup(srv.Close)
	return strings.TrimPrefix(srv.URL, "http://"), counter
}

// Каждый опрос создаёт нового клиента, и соединений на камере от этого
// прибавляться не должно: именно так накапливались дескрипторы на камерах.
func TestMajesticClientsShareOneConnection(t *testing.T) {
	ip, counter := newCountingCamera(t)

	for i := 0; i < 20; i++ {
		client := NewMajesticClient(ip, "", "")
		if _, err := client.get(context.Background(), "/api/v1/sources", majesticTimeout); err != nil {
			t.Fatalf("опрос %d: %v", i, err)
		}
	}

	if opened, _ := counter.snapshot(); opened != 1 {
		t.Fatalf("20 опросов открыли %d соединений, ожидалось одно", opened)
	}
}

// Простаивающее соединение должно закрываться само: после удаления камеры
// опросов нет, и закрыть его больше некому.
func TestMajesticIdleConnectionCloses(t *testing.T) {
	saved := majesticTransport.IdleConnTimeout
	majesticTransport.IdleConnTimeout = 50 * time.Millisecond
	t.Cleanup(func() {
		majesticTransport.CloseIdleConnections()
		majesticTransport.IdleConnTimeout = saved
	})

	ip, counter := newCountingCamera(t)
	client := NewMajesticClient(ip, "", "")
	if _, err := client.get(context.Background(), "/api/v1/sources", majesticTimeout); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, current := counter.snapshot(); current == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	_, current := counter.snapshot()
	t.Fatalf("соединений осталось открыто: %d", current)
}
