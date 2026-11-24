package handlers

import (
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/nvr/backend/internal/domain"
)

// Проверки доступа к данным СКУД: событие, владелец, группа.
// Проверяется само правило — «видно, если открыта хотя бы одна доступная
// дверь» — без базы: обработчики берут решение из этих функций.

func TestHolderHasAllowedDoor(t *testing.T) {
	okController := uuid.New()
	secretController := uuid.New()
	holder := &domain.ACSHolder{
		Doors: []domain.ACSHolderDoor{
			{ControllerID: okController},
			{ControllerID: secretController},
		},
	}

	if !holderHasAllowedDoor(holder, []uuid.UUID{okController}) {
		t.Fatal("владелец с дверью доступного контроллера должен быть виден")
	}
	if holderHasAllowedDoor(holder, []uuid.UUID{uuid.New()}) {
		t.Fatal("владелец чужих дверей не должен быть виден")
	}
	if !holderHasAllowedDoor(holder, nil) {
		t.Fatal("nil означает полный доступ — владелец должен быть виден")
	}
	if holderHasAllowedDoor(holder, []uuid.UUID{}) {
		t.Fatal("пустой список — «ничего не видно», а не полный доступ")
	}
	// nil-владелец при полном доступе считается видимым: сама проверка
	// отвечает на вопрос «есть ли ограничение», а отсутствие владельца
	// ловят обработчики отдельно. Здесь фиксируем это поведение, чтобы
	// его случайное изменение не открыло список чужих карточек.
	if !holderHasAllowedDoor(nil, nil) {
		t.Fatal("при полном доступе ограничения нет — функция должна вернуть true")
	}
}

func TestGroupHasAllowedDoor(t *testing.T) {
	ctrl := uuid.New()
	group := &domain.ACSGroup{Doors: []domain.ACSGroupDoor{{ControllerID: ctrl}}}

	if !groupHasAllowedDoor(group, []uuid.UUID{ctrl}) {
		t.Fatal("группа с дверью доступного контроллера должна быть видна")
	}
	if groupHasAllowedDoor(group, []uuid.UUID{uuid.New()}) {
		t.Fatal("группа чужих дверей не должна быть видна")
	}
	if !groupHasAllowedDoor(group, nil) {
		t.Fatal("nil означает полный доступ")
	}
	if groupHasAllowedDoor(group, []uuid.UUID{}) {
		t.Fatal("пустой список — «ничего не видно»")
	}
}

func TestACSEventVisible(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v1/acs/events/x/snapshot", nil)
	// Без guard функция обязана отказывать, а не пропускать: забытая сборка
	// должна проявляться отказом, а не показом чужих снимков.
	cam := uuid.New()
	ctrl := uuid.New()
	if acsEventVisible(r, nil, &cam, &ctrl) {
		t.Fatal("без guard событие не должно быть видно")
	}
}
