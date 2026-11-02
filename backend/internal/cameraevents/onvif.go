package cameraevents

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/nvr/backend/internal/domain"
)

// onvifSource — события ONVIF через PullPoint.
//
// Почему PullPoint, а не BaseNotification. Подписка через PullPoint работает
// на всех камерах, где вообще есть служба событий, и не требует, чтобы
// сервер был доступен камере по HTTP. Для установки в локальной сети это
// важно: камера может стоять за NAT, а сервер — нет.
type onvifSource struct {
	cam    domain.Camera
	user   string
	pass   string
	client *http.Client
	// eventsURL — адрес службы событий. Пусто до первого обнаружения:
	// адрес спрашивается у устройства, а не составляется из IP.
	eventsURL string
}

func newONVIFSource(cam domain.Camera, user, pass string) *onvifSource {
	return &onvifSource{
		cam:  cam,
		user: user,
		pass: pass,
		// Таймаут больше времени PullMessages: устройство держит запрос
		// открытым до появления события или до истечения Timeout.
		client: &http.Client{Timeout: 35 * time.Second},
	}
}

func (s *onvifSource) Name() string { return "onvif" }

// probe проверяет, есть ли у камеры служба событий.
func (s *onvifSource) probe(ctx context.Context) error {
	_, err := s.discover(ctx)
	return err
}

// Run подписывается на события и переподключается при ошибках.
func (s *onvifSource) Run(ctx context.Context, emit func(Event) error) error {
	eventsURL, err := s.discover(ctx)
	if err != nil {
		return err
	}

	subURL, term, err := s.subscribe(ctx, eventsURL)
	if err != nil {
		return err
	}
	defer s.unsubscribe(context.Background(), subURL)

	if term.IsZero() {
		term = time.Now().Add(60 * time.Second)
	}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		// Продлеваем подписку заранее: если ждать до последнего, между
		// истечением и Renew теряются события, а камера отвечает отказом.
		if time.Until(term) < 15*time.Second {
			if newTerm, err := s.renew(ctx, subURL); err == nil {
				term = newTerm
			} else {
				return fmt.Errorf("не удалось продлить подписку ONVIF: %w", err)
			}
		}

		raw, err := s.pull(ctx, subURL)
		if err != nil {
			return err
		}
		notifications, err := parseONVIFNotifications(raw)
		if err != nil {
			return err
		}
		if len(notifications) == 0 {
			// Часть прошивок отвечает сразу пустым списком, не выдерживая
			// Timeout. Без паузы получился бы холостой цикл запросов.
			if !sleepCtx(ctx, 500*time.Millisecond) {
				return ctx.Err()
			}
			continue
		}
		for _, n := range notifications {
			ev, ok := n.toEvent()
			if !ok {
				continue
			}
			if err := emit(ev); err != nil {
				return err
			}
		}
	}
}

// discover находит адрес службы событий.
func (s *onvifSource) discover(ctx context.Context) (string, error) {
	if s.eventsURL != "" {
		return s.eventsURL, nil
	}

	body := `<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>`
	raw, err := s.call(ctx, "http://"+s.cam.IP+"/onvif/device_service", body)
	if err != nil {
		return "", err
	}

	var out struct {
		XAddr string `xml:"Body>GetCapabilitiesResponse>Capabilities>Events>XAddr"`
	}
	if err := xml.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("не удалось разобрать возможности ONVIF: %w", err)
	}
	if strings.TrimSpace(out.XAddr) == "" {
		return "", fmt.Errorf("камера не сообщила адрес службы событий ONVIF")
	}

	s.eventsURL = replaceHost(out.XAddr, s.cam.IP)
	return s.eventsURL, nil
}

// subscribe создаёт подписку PullPoint.
func (s *onvifSource) subscribe(ctx context.Context, eventsURL string) (string, time.Time, error) {
	body := `<tev:CreatePullPointSubscription>
  <tev:InitialTerminationTime>PT60S</tev:InitialTerminationTime>
</tev:CreatePullPointSubscription>`

	raw, err := s.call(ctx, eventsURL, body)
	if err != nil {
		return "", time.Time{}, err
	}

	var out struct {
		Address string `xml:"Body>CreatePullPointSubscriptionResponse>SubscriptionReference>Address"`
		Term    string `xml:"Body>CreatePullPointSubscriptionResponse>TerminationTime"`
	}
	if err := xml.Unmarshal(raw, &out); err != nil {
		return "", time.Time{}, fmt.Errorf("не удалось разобрать подписку ONVIF: %w", err)
	}
	if strings.TrimSpace(out.Address) == "" {
		return "", time.Time{}, fmt.Errorf("ONVIF не вернул адрес подписки")
	}

	return replaceHost(out.Address, s.cam.IP), parseONVIFTime(out.Term), nil
}

// pull забирает накопленные сообщения.
func (s *onvifSource) pull(ctx context.Context, subURL string) ([]byte, error) {
	body := `<tev:PullMessages>
  <tev:Timeout>PT20S</tev:Timeout>
  <tev:MessageLimit>50</tev:MessageLimit>
</tev:PullMessages>`
	return s.call(ctx, subURL, body)
}

// renew продлевает подписку.
func (s *onvifSource) renew(ctx context.Context, subURL string) (time.Time, error) {
	body := `<wsnt:Renew><wsnt:TerminationTime>PT60S</wsnt:TerminationTime></wsnt:Renew>`
	raw, err := s.call(ctx, subURL, body)
	if err != nil {
		return time.Time{}, err
	}
	var out struct {
		Term string `xml:"Body>RenewResponse>TerminationTime"`
	}
	if err := xml.Unmarshal(raw, &out); err != nil {
		return time.Time{}, err
	}
	term := parseONVIFTime(out.Term)
	if term.IsZero() {
		term = time.Now().Add(60 * time.Second)
	}
	return term, nil
}

func (s *onvifSource) unsubscribe(ctx context.Context, subURL string) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, _ = s.call(ctx, subURL, `<wsnt:Unsubscribe/>`)
}

// call отправляет SOAP-запрос и отделяет отказ устройства от успеха.
func (s *onvifSource) call(ctx context.Context, rawURL, body string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, strings.NewReader(s.envelope(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/soap+xml; charset=utf-8")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ONVIF недоступен: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("ONVIF отклонил учётные данные")
	}
	// Отказ приходит и с кодом 200 — внутри конверта. Проверяем текст,
	// а не только код ответа.
	if fault := onvifFault(raw); fault != "" {
		return nil, fmt.Errorf("ONVIF вернул отказ: %s", fault)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ONVIF ответил кодом %d", resp.StatusCode)
	}
	return raw, nil
}

// envelope собирает SOAP-конверт с WS-Security.
//
// Формула digest та же, что в cameraapi: Base64(SHA1(nonce + created +
// password)). Камера проверяет байты, и другая формула не принимается.
func (s *onvifSource) envelope(body string) string {
	security := ""
	if s.user != "" {
		nonce := make([]byte, 16)
		if _, err := rand.Read(nonce); err != nil {
			// Криптостойкость здесь не критична, но предсказуемый nonce
			// тоже не нужен: подставляем время.
			binary.BigEndian.PutUint64(nonce, uint64(time.Now().UnixNano()))
		}
		created := time.Now().UTC().Format("2006-01-02T15:04:05Z")
		h := sha1.New()
		h.Write(nonce)
		h.Write([]byte(created))
		h.Write([]byte(s.pass))
		digest := base64.StdEncoding.EncodeToString(h.Sum(nil))

		security = fmt.Sprintf(`
  <s:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>%s</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">%s</wsse:Password>
        <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">%s</wsse:Nonce>
        <wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">%s</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>
  </s:Header>`, escapeXML(s.user), digest,
			base64.StdEncoding.EncodeToString(nonce), created)
	}

	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
 xmlns:tev="http://www.onvif.org/ver10/events/wsdl"
 xmlns:wsnt="http://docs.oasis-open.org/wsn/b-2"
 xmlns:wsa="http://www.w3.org/2005/08/addressing"
 xmlns:tt="http://www.onvif.org/ver10/schema">%s
  <s:Body>%s</s:Body>
</s:Envelope>`, security, body)
}

// onvifFault достаёт текст отказа из конверта.
func onvifFault(raw []byte) string {
	var fault struct {
		Reason string `xml:"Body>Fault>Reason>Text"`
	}
	if xml.Unmarshal(raw, &fault) != nil {
		return ""
	}
	return strings.TrimSpace(fault.Reason)
}

// replaceHost заменяет хост в адресе, полученном от устройства.
//
// Камера сообщает адрес, записанный в её настройках. Для камеры за
// туннелем это внутренний адрес, до которого сервер не дойдёт. Порт и
// путь сохраняем: их устройство знает точнее.
func replaceHost(raw, ip string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || ip == "" {
		return raw
	}
	host, _, err := net.SplitHostPort(u.Host)
	if err != nil {
		host = u.Host
	}
	if host == ip {
		return raw
	}
	if port := u.Port(); port != "" {
		u.Host = net.JoinHostPort(ip, port)
	} else {
		u.Host = ip
	}
	return u.String()
}

// parseONVIFTime разбирает время окончания подписки.
//
// Значения приходят в UTC с суффиксом Z. Пустое или непонятное значение
// означает «не сообщили» — тогда вызывающий подставит своё.
func parseONVIFTime(v string) time.Time {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t
	}
	return time.Time{}
}

// escapeXML экранирует значение для подстановки в конверт.
func escapeXML(s string) string {
	var b strings.Builder
	xml.EscapeText(&b, []byte(s))
	return b.String()
}
