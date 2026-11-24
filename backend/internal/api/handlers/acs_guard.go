package handlers

// Проверки доступа к данным СКУД: снимок события, владельцы, группы.
//
// Зачем отдельный файл, а не правки в каждом обработчике. Правило одно:
// «пользователь видит событие/владельца/группу, если он видит хотя бы один
// контроллер, с которым это связано». Продублировать его в трёх местах —
// значит рано или поздно разойтись, и одна из точек останется открытой.
//
// Решение принимается по списку разрешённых контроллеров, который уже
// строит AccessGuard. Отдельного права «видеть СКУД» нет: оно совпадает с
// доступом к контроллерам, как и в журнале проходов.

import (
	"net/http"

	"github.com/google/uuid"
)

// acsEventVisible отвечает, можно ли показать событие СКУД.
//
// Событие может быть связано с камерой (снимок с неё) и с контроллером
// (дверь). Показываем, если доступен хотя бы один из них: у части событий
// камеры нет вовсе, а у части нет контроллера (событие пришло без привязки).
// Не найдено и не разрешено дают одинаковый ответ — иначе по коду ответа
// можно перечислить чужие события.
func acsEventVisible(r *http.Request, guard *AccessGuard, cameraID, controllerID *uuid.UUID) bool {
	if guard == nil {
		return false
	}
	if cameraID != nil && guard.Allows(r, *cameraID) {
		return true
	}
	if controllerID != nil && guard.AllowsACSController(r, *controllerID) {
		return true
	}
	return false
}

// acsReachableControllers отдаёт контроллеры, которые пользователь видит.
//
// nil означает «без ограничений» (полный доступ). Пустой список — «ничего
// не видно»; эти два случая нельзя путать, иначе ограничение превратится
// в полный доступ.
func acsReachableControllers(r *http.Request, guard *AccessGuard) []uuid.UUID {
	if guard == nil {
		return []uuid.UUID{}
	}
	all, ids := guard.AllowedACSControllerIDs(r)
	if all {
		return nil
	}
	if ids == nil {
		return []uuid.UUID{}
	}
	return ids
}

// controllerFilterSet превращает список разрешённых контроллеров в множество
// для быстрой проверки. nil — без ограничений.
func controllerFilterSet(allowed []uuid.UUID) map[uuid.UUID]struct{} {
	if allowed == nil {
		return nil
	}
	set := make(map[uuid.UUID]struct{}, len(allowed))
	for _, id := range allowed {
		set[id] = struct{}{}
	}
	return set
}
