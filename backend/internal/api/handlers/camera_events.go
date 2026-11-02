package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nvr/backend/internal/api/middleware"
	"github.com/nvr/backend/internal/domain"
	"github.com/nvr/backend/internal/repository/postgres"
	"github.com/nvr/backend/internal/service"
	"github.com/rs/zerolog/log"
)

// CameraEventsHandler — настройки приёма событий от самой камеры.
//
// Отдельный обработчик, а не поля в карточке: у блока своя модель
// (источник, классы, склейка), и держать его вместе с потоками и учётными
// данными значило бы смешивать настройки устройства и настройки приёма.
type CameraEventsHandler struct {
	repo *postgres.CameraRepo
	// access — та же проверка доступа, что у карточки камеры. Настройку
	// нельзя менять у камеры, которую пользователю не показывают.
	access *service.CameraAccessService
}

func NewCameraEventsHandler(repo *postgres.CameraRepo) *CameraEventsHandler {
	return &CameraEventsHandler{repo: repo}
}

func (h *CameraEventsHandler) WithAccess(access *service.CameraAccessService) *CameraEventsHandler {
	h.access = access
	return h
}

func (h *CameraEventsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := h.cameraID(w, r)
	if !ok {
		return
	}
	cam, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "camera not found"})
		return
	}
	if !h.allows(r, id) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "camera not found"})
		return
	}
	writeJSON(w, http.StatusOK, domain.CameraEventsFromSettings(cam.Settings))
}

func (h *CameraEventsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := h.cameraID(w, r)
	if !ok {
		return
	}

	var req domain.CameraEventsSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	req = domain.NormalizeCameraEventsSettings(req)
	if err := domain.ValidateCameraEventsSettings(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if _, err := h.repo.GetByID(r.Context(), id); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "camera not found"})
		return
	}
	if !h.allows(r, id) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "camera not found"})
		return
	}

	if err := h.repo.UpdateSettingsKey(r.Context(), id, domain.CameraEventsKey, req); err != nil {
		log.Error().Err(err).Str("camera_id", id.String()).Msg("не удалось сохранить настройки приёма событий")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось сохранить настройки"})
		return
	}

	log.Info().Str("camera_id", id.String()).Bool("enabled", req.Enabled).
		Str("source", req.Source).Msg("настройки приёма событий камеры сохранены")
	writeJSON(w, http.StatusOK, req)
}

func (h *CameraEventsHandler) cameraID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return uuid.Nil, false
	}
	return id, true
}

// allows проверяет доступ к камере.
//
// Если проверка не собрана, отвечаем отказом: настройка, меняющая поток
// событий, не должна стать доступной из-за забытой проводки.
func (h *CameraEventsHandler) allows(r *http.Request, id uuid.UUID) bool {
	if h.access == nil {
		log.Error().Msg("проверка доступа к камерам не настроена")
		return false
	}
	return h.access.Allows(r.Context(), middleware.UserFromContext(r.Context()), id)
}
