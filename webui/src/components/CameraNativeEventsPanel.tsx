import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Radar, Save } from 'lucide-react'
import { camerasAPI, type CameraEventsSettings } from '../api/client'
import { useToast } from '../context/ToastContext'

/**
 * Приём событий от бортовой детекции камеры.
 *
 * Отдельная панель, а не часть настроек нашей детекции: здесь решается,
 * слушать ли саму камеру. Смешивать эти вещи нельзя — оператор ищет
 * «что искать в кадре» и «откуда брать события» в разных местах.
 */
export default function CameraNativeEventsPanel({ cameraId }: { cameraId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [form, setForm] = useState<CameraEventsSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    camerasAPI
      .getCameraEvents(cameraId)
      .then((res) => {
        if (alive) setForm(res.data)
      })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.error || t('cameraEventsPanel.loadFailed'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [cameraId, t])

  const update = <K extends keyof CameraEventsSettings>(key: K, value: CameraEventsSettings[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async () => {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      const res = await camerasAPI.updateCameraEvents(cameraId, form)
      setForm(res.data)
      toast.success(t('cameraEventsPanel.saved'))
    } catch (e: any) {
      const message = e?.response?.data?.error || t('cameraEventsPanel.saveFailed')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Loader2 size={16} className="spin" />
        {t('cameraEventsPanel.loading')}
      </div>
    )
  }

  if (!form) {
    return (
      <div className="card" style={{ padding: 20, color: 'var(--danger, #d33)' }}>
        {error || t('cameraEventsPanel.loadFailed')}
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: 8, fontSize: 15 }}>
        <Radar size={18} style={{ color: 'var(--accent)' }} />
        {t('cameraEventsPanel.title')}
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        {t('cameraEventsPanel.hint')}
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
        />
        <span>{t('cameraEventsPanel.enabled')}</span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          {t('cameraEventsPanel.source')}
          <select
            className="input"
            value={form.source}
            onChange={(e) => update('source', e.target.value as CameraEventsSettings['source'])}
          >
            <option value="auto">{t('cameraEventsPanel.sourceAuto')}</option>
            <option value="onvif">ONVIF</option>
            <option value="hikvision">Hikvision ISAPI</option>
            <option value="openipc">OpenIPC</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          {t('cameraEventsPanel.interval')}
          <input
            className="input"
            type="number"
            min={1}
            max={3600}
            value={form.min_interval_sec}
            onChange={(e) => update('min_interval_sec', Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 18, marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.motion}
            onChange={(e) => update('motion', e.target.checked)}
          />
          <span>{t('cameraEventsPanel.motion')}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.objects}
            onChange={(e) => update('objects', e.target.checked)}
          />
          <span>{t('cameraEventsPanel.objects')}</span>
        </label>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 0, marginBottom: 16 }}>
        {t('cameraEventsPanel.openipcHint')}
      </p>

      {error && (
        <p style={{ color: 'var(--danger, #d33)', fontSize: 13, marginTop: 0 }}>{error}</p>
      )}

      <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
        {saving ? t('cameraEventsPanel.saving') : t('cameraEventsPanel.save')}
      </button>
    </div>
  )
}
