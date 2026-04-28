import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Database,
  LogOut,
  Download,
  Pencil,
  X,
  Users,
  UserPlus,
  Repeat,
  AlertTriangle,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { exportToExcel } from './export'
import './style.css'

const budgetGroups = [
  { value: 'income', label: 'Příjem', type: 'income' },
  { value: 'mandatory', label: 'Mandatorní výdaj', type: 'expense' },
  { value: 'extra', label: 'Mimořádný výdaj', type: 'expense' },
  { value: 'planned', label: 'Plánovaný rozpočet', type: 'expense' },
]

const categories = {
  income: ['Výplata', 'Podnikání', 'Přídavky', 'Dárky', 'Ostatní'],
  expense: ['Bydlení', 'Jídlo', 'Doprava', 'Děti', 'Zdraví', 'Zábava', 'Oblečení', 'Spoření', 'Ostatní'],
}

const today = new Date().toISOString().slice(0, 10)
const currentMonth = today.slice(0, 7)

function money(value) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
  }).format(Number(value || 0))
}

function groupLabel(value) {
  return budgetGroups.find(g => g.value === value)?.label || 'Mandatorní výdaj'
}

function groupType(value) {
  return budgetGroups.find(g => g.value === value)?.type || 'expense'
}

function emptyForm() {
  return {
    title: '',
    amount: '',
    budget_group: 'mandatory',
    type: 'expense',
    category: 'Jídlo',
    transaction_date: today,
    note: '',
    is_recurring: false,
  }
}

function App() {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })

  const [householdId, setHouseholdId] = useState(null)
  const [memberEmail, setMemberEmail] = useState('')
  const [memberMessage, setMemberMessage] = useState('')

  const [items, setItems] = useState([])
  const [month, setMonth] = useState(currentMonth)
  const [loading, setLoading] = useState(true)
  const [editingItem, setEditingItem] = useState(null)
  const [showRecurringOnly, setShowRecurringOnly] = useState(false)

  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    async function initAuth() {
      const { data } = await supabase.auth.getSession()
      setUser(data.session?.user || null)
      setLoading(false)
    }

    initAuth()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) initializeHousehold()
    else {
      setHouseholdId(null)
      setItems([])
    }
  }, [user])

  async function initializeHousehold() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_or_create_my_household')

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setHouseholdId(data)
    await loadItems(data)
    setLoading(false)
  }

  async function loadItems(id = householdId) {
    if (!id) return

    const { data, error } = await supabase
      .from('budget_transactions')
      .select('*')
      .eq('household_id', id)
      .order('transaction_date', { ascending: false })

    if (error) alert(error.message)
    else setItems(data || [])
  }

  async function handleAuth(e) {
    e.preventDefault()

    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword(authForm)
      if (error) alert(error.message)
    } else {
      const { error } = await supabase.auth.signUp(authForm)
      if (error) alert(error.message)
      else setAuthMode('login')
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  async function addMember(e) {
    e.preventDefault()

    const { error } = await supabase.rpc('add_household_member_by_email', {
      member_email: memberEmail,
    })

    setMemberMessage(error ? error.message : 'Člen přidán')
    setMemberEmail('')
  }

  const monthlyItems = useMemo(
    () => items.filter(i => String(i.transaction_date || '').startsWith(month)),
    [items, month]
  )

  const filtered = useMemo(
    () => (showRecurringOnly ? monthlyItems.filter(i => i.is_recurring) : monthlyItems),
    [monthlyItems, showRecurringOnly]
  )

  const totals = useMemo(() => {
    const sum = (f) => monthlyItems.filter(f).reduce((s, i) => s + Number(i.amount), 0)

    const income = sum(i => i.budget_group === 'income')
    const mandatory = sum(i => i.budget_group === 'mandatory')
    const extra = sum(i => i.budget_group === 'extra')
    const planned = sum(i => i.budget_group === 'planned')
    const recurring = sum(i => i.is_recurring && i.budget_group !== 'income')

    const totalExpenses = mandatory + extra + planned

    return {
      income,
      mandatory,
      extra,
      planned,
      recurring,
      totalExpenses,
      balance: income - totalExpenses,
      expectedBalance: income - mandatory - planned,
      recurringRatio: income > 0 ? recurring / income : 0,
    }
  }, [monthlyItems])

  // 🔥 ALERTY
  const alerts = useMemo(() => {
    const a = []

    if (totals.recurringRatio > 0.6)
      a.push(`Fixní náklady jsou ${Math.round(totals.recurringRatio * 100)} % příjmů`)

    if (totals.extra > totals.planned)
      a.push('Mimořádné výdaje překročily plán')

    if (totals.balance < 0)
      a.push('Jsi v mínusu')

    return a
  }, [totals])

  async function saveItem(e) {
    e.preventDefault()

    const payload = {
      ...form,
      amount: Number(form.amount),
      type: groupType(form.budget_group),
      user_id: user.id,
      household_id: householdId,
    }

    if (editingItem) {
      await supabase.from('budget_transactions').update(payload).eq('id', editingItem.id)
    } else {
      await supabase.from('budget_transactions').insert(payload)
    }

    await loadItems()
    setForm(emptyForm())
    setEditingItem(null)
  }

  function startEdit(item) {
    setEditingItem(item)
    setForm(item)
  }

  async function deleteItem(id) {
    await supabase.from('budget_transactions').delete().eq('id', id)
    await loadItems()
  }

  if (!user)
    return (
      <main className="app">
        <section className="panel auth-panel">
          <h1>{authMode === 'login' ? 'Přihlášení' : 'Registrace'}</h1>
          <form className="form auth-form" onSubmit={handleAuth}>
            <input placeholder="Email" onChange={e => setAuthForm({ ...authForm, email: e.target.value })} />
            <input type="password" placeholder="Heslo" onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
            <button>{authMode === 'login' ? 'Přihlásit' : 'Registrovat'}</button>
          </form>
          <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            Přepnout
          </button>
        </section>
      </main>
    )

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Rodinný rozpočet</p>
          <h1>Chytrý rozpočet</h1>
        </div>

        <div className="status">
          <Database size={18} />
          Supabase
          <button onClick={() => exportToExcel(monthlyItems)}>
            <Download size={16} /> Export
          </button>
          <button onClick={logout}>
            <LogOut size={16} /> Odhlásit
          </button>
        </div>
      </header>

      {/* 🔥 ALERT BOX */}
      {alerts.length > 0 && (
        <section className="panel" style={{ border: '2px solid #f59e0b' }}>
          <h2><AlertTriangle /> Upozornění</h2>
          {alerts.map((a, i) => (
            <p key={i}>⚠️ {a}</p>
          ))}
        </section>
      )}

      {/* KARTY */}
      <section className="grid cards">
        <Card icon={<TrendingUp />} title="Příjmy" value={money(totals.income)} />
        <Card icon={<Repeat />} title="Fixní náklady" value={money(totals.recurring)} />
        <Card icon={<TrendingDown />} title="Mimořádné" value={money(totals.extra)} />
        <Card icon={<Wallet />} title="Zůstatek" value={money(totals.balance)} />
      </section>

      {/* FORM */}
      <section className="panel">
        <form className="form" onSubmit={saveItem}>
          <input placeholder="Název" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input type="number" placeholder="Částka" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />

          <select value={form.budget_group} onChange={e => setForm({ ...form, budget_group: e.target.value })}>
            {budgetGroups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>

          <label>
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={e => setForm({ ...form, is_recurring: e.target.checked })}
            />
            Fixní
          </label>

          <button><Plus /> Přidat</button>
        </form>
      </section>

      {/* LIST */}
      <section className="panel">
        {filtered.map(item => (
          <div key={item.id} className="row">
            <div>
              <strong>{item.title} {item.is_recurring && '🔁'}</strong>
              <span>{groupLabel(item.budget_group)}</span>
            </div>
            <div>{money(item.amount)}</div>
            <button onClick={() => startEdit(item)}><Pencil size={16} /></button>
            <button onClick={() => deleteItem(item.id)}><Trash2 size={16} /></button>
          </div>
        ))}
      </section>
    </main>
  )
}

function Card({ icon, title, value }) {
  return (
    <div className="card">
      {icon}
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
