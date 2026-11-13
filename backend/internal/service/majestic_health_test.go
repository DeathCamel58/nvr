package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const metricsOld310 = `# HELP node_memory_MemTotal_bytes Memory information field MemTotal.
node_memory_MemTotal_bytes 117440512
node_memory_MemFree_bytes 20971520
node_memory_Buffers_bytes 10485760
node_memory_Cached_bytes 73400320
node_load1 0.5
`

const metricsNew49 = `node_memory_MemTotal_bytes 104857600
node_memory_MemFree_bytes 3145728
node_memory_MemAvailable_bytes 4823449
node_memory_Buffers_bytes 1048576
node_memory_Cached_bytes 52428800
`

func TestGetHealthMemoryAvailable(t *testing.T) {
	cases := []struct {
		name      string
		metrics   string
		wantKnown bool
		wantMB    float64
	}{
		{"kernel 3.10 without MemAvailable: MemFree+Buffers+Cached", metricsOld310, true, 100},
		{"kernel 4.9 reports MemAvailable", metricsNew49, true, 4823449.0 / 1024 / 1024},
		{"no memory metrics at all", "node_load1 0.5\n", false, 0},
		{"only MemTotal: no estimate", "node_memory_MemTotal_bytes 117440512\n", false, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(tc.metrics))
			}))
			defer srv.Close()

			h, err := NewMajesticClient(strings.TrimPrefix(srv.URL, "http://"), "", "").GetHealth(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if h.MemAvailableKnown != tc.wantKnown {
				t.Fatalf("MemAvailableKnown = %v, want %v", h.MemAvailableKnown, tc.wantKnown)
			}
			if d := h.MemAvailableMB - tc.wantMB; d > 0.01 || d < -0.01 {
				t.Fatalf("MemAvailableMB = %.2f, want %.2f", h.MemAvailableMB, tc.wantMB)
			}
		})
	}
}

func TestEvaluateMemoryRule(t *testing.T) {
	cases := []struct {
		name  string
		known bool
		mb    float64
		want  string
	}{
		{"missing metric is not zero", false, 0, ""},
		{"critical", true, 4.6, "mem_critical"},
		{"low", true, 8, "mem_low"},
		{"enough", true, 100, ""},
	}
	s := &CameraHealthService{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &CameraHealth{Level: "ok", Flowing: true, MemTotalMB: 112, MemAvailableMB: tc.mb, MemAvailableKnown: tc.known}
			s.evaluate(h)
			got := ""
			for _, i := range h.Issues {
				if strings.HasPrefix(i.Code, "mem_") {
					got = i.Code
				}
			}
			if got != tc.want {
				t.Fatalf("memory issue = %q, want %q", got, tc.want)
			}
		})
	}
}
