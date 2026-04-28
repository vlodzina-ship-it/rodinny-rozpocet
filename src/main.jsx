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
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { exportToExcel } from './export'
import './style.css'

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

function emptyForm() {
  return {
    title: '',
    amount: '',
    type: 'expense',
    category: 'Jídlo',
    transaction_date: today,
    note: '',
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

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user) {
      initializeHousehold(user.id)
    } else {
      setHouseholdId(null)
      setItems([])
      setMemberEmail('')
      setMemberMessage('')
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

  async function handleAuth(e) {
    e.preventDefault()

    const email = authForm.email.trim()
    const password = authForm.password

    if (!email || !password) {
      alert('Vyplň e-mail i heslo.')
      return
    }

    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        alert(error.message)
      }

      return
    }

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      alert(error.message)
      return
    }

    alert('Registrace proběhla. Teď se můžeš přihlásit.')
    setAuthMode('login')
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setHouseholdId(null)
    setItems([])
    setEditingItem(null)
    setForm(emptyForm())
    setMemberEmail('')
    setMemberMessage('')
  }

  async function loadItems(activeHouseholdId = householdId) {
    if (!activeHouseholdId) return

    const { data, error } = await supabase
      .from('budget_transactions')
      .select('*')
      .eq('household_id', activeHouseholdId)
      .order('transaction_date', { ascending: false })

    if (error) {
      alert(error.message)
      setItems([])
    } else {
      setItems(data || [])
    }
  }

  async function addMember(e) {
    e.preventDefault()

    const email = memberEmail.trim()

    if (!email) {
      setMemberMessage('Vyplň e-mail člena.')
      return
    }

    setMemberMessage('Přidávám člena…')

    const { error } = await supabase.rpc('add_household_member_by_email', {
      member_email: email,
    })

    if (error) {
      setMemberMessage(error.message)
      return
    }

    setMemberEmail('')
    setMemberMessage('Člen byl přidán do společného rozpočtu.')
    await loadItems()
  }

  const filtered = useMemo(() => {
    return items.filter(item => String(item.transaction_date || '').startsWith(month))
  }, [items, month])

  const totals = useMemo(() => {
    const income = filtered
      .filter(item => item.type === 'income')
      .reduce((sum, item) => sum + Number(item.amount), 0)

    const expense = filtered
      .filter(item => item.type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount), 0)

    return {
      income,
      expense,
      balance: income - expense,
    }
  }, [filtered])

  const byCategory = useMemo(() => {
    const map = {}

    for (const item of filtered.filter(item => item.type === 'expense')) {
      map[item.category] = (map[item.category] || 0) + Number(item.amount)
    }

    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  async function saveItem(e) {
    e.preventDefault()

    if (!user) {
      alert('Nejdřív se přihlas.')
      return
    }

    if (!householdId) {
      alert('Společný rozpočet ještě není připravený.')
      return
    }

    if (!form.title.trim() || !form.amount) {
      alert('Vyplň název a částku.')
      return
    }

    const payload = {
      title: form.title.trim(),
      amount: Number(form.amount),
      type: form.type,
      category: form.category || categories[form.type][0],
      transaction_date: form.transaction_date,
      note: form.note.trim(),
      user_id: user.id,
      household_id: householdId,
    }

    if (editingItem) {
      const { error } = await supabase
        .from('budget_transactions')
        .update(payload)
        .eq('id', editingItem.id)
        .eq('household_id', householdId)

      if (error) {
        alert(error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('budget_transactions')
        .insert(payload)

      if (error) {
        alert(error.message)
        return
      }
    }

    await loadItems(householdId)
    cancelEdit()
  }

  function startEdit(item) {
    setEditingItem(item)

    setForm({
      title: item.title || '',
      amount: item.amount || '',
      type: item.type || 'expense',
      category: item.category || 'Jídlo',
      transaction_date: item.transaction_date || today,
      note: item.note || '',
    })
  }

  function cancelEdit() {
    setEditingItem(null)
    setForm(emptyForm())
  }

  async function deleteItem(id) {
    if (!user) {
      alert('Nejdřív se přihlas.')
      return
    }

    if (!householdId) {
      alert('Společný rozpočet ještě není připravený.')
      return
    }

    if (!confirm('Opravdu smazat položku?')) {
      return
    }

    const { error } = await supabase
      .from('budget_transactions')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId)

    if (error) {
      alert(error.message)
      return
    }

    await loadItems(householdId)

    if (editingItem?.id === id) {
      cancelEdit()
    }
  }

  function updateForm(next) {
    const changedType = next.type && next.type !== form.type

    setForm({
      ...form,
      ...next,
      category: changedType
        ? categories[next.type][0]
        : next.category ?? form.category,
    })
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="app">
        <section className="panel">
          <h1>Supabase není nastavený</h1>
          <p className="muted">
            Zkontroluj GitHub Secrets: VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY.
          </p>
        </section>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="app">
        <section className="panel">
          <p>Načítám…</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="app">
        <section className="panel auth-panel">
          <h1>{authMode === 'login' ? 'Přihlášení' : 'Registrace'}</h1>

          <form className="form auth-form" onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="E-mail"
              value={authForm.email}
              onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
            />

            <input
              type="password"
              placeholder="Heslo"
              value={authForm.password}
              onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
            />

            <button type="submit">
              {authMode === 'login' ? 'Přihlásit' : 'Registrovat'}
            </button>
          </form>

          <button
            className="link-button"
            type="button"
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
          >
            {authMode === 'login'
              ? 'Nemáš účet? Registrovat'
              : 'Už máš účet? Přihlásit'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Rodinný rozpočet</p>
          <h1>Společný přehled příjmů a výdajů</h1>
          <p className="muted">Přihlášen: {user.email}</p>
        </div>

        <div className="status">
          <Database size={18} />
          Supabase aktivní

          <button className="logout" type="button" onClick={() => exportToExcel(filtered)}>
            <Download size={16} />
            Export Excel
          </button>

          <button className="logout" type="button" onClick={logout}>
            <LogOut size={16} />
            Odhlásit
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Rodinný rozpočet</h2>
            <p className="muted">
              Přidej manželku nebo dalšího člena e-mailem. Uživatel musí být nejdřív zaregistrovaný v aplikaci.
            </p>
          </div>
        </div>

        <form className="form member-form" onSubmit={addMember}>
          <input
            type="email"
            placeholder="E-mail člena rodiny"
            value={memberEmail}
            onChange={e => setMemberEmail(e.target.value)}
          />

          <button type="submit">
            <UserPlus size={18} />
            Přidat člena
          </button>
        </form>

        {memberMessage && <p className="muted">{memberMessage}</p>}

        <p className="muted">
          ID rozpočtu: {householdId || 'načítám…'}
        </p>
      </section>

      <section className="grid cards">
        <Card icon={<TrendingUp />} title="Příjmy" value={money(totals.income)} />
        <Card icon={<TrendingDown />} title="Výdaje" value={money(totals.expense)} />
        <Card icon={<Wallet />} title="Zůstatek" value={money(totals.balance)} highlight={totals.balance >= 0} />
        <Card icon={<Users />} title="Režim" value="Sdílený" highlight />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{editingItem ? 'Upravit položku' : 'Nová položka'}</h2>

          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
        </div>

        <form className="form" onSubmit={saveItem}>
          <input
            placeholder="Název"
            value={form.title}
            onChange={e => updateForm({ title: e.target.value })}
          />

          <input
            placeholder="Částka"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={e => updateForm({ amount: e.target.value })}
          />

          <select
            value={form.type}
            onChange={e => updateForm({ type: e.target.value })}
          >
            <option value="expense">Výdaj</option>
            <option value="income">Příjem</option>
          </select>

          <select
            value={form.category}
            onChange={e => updateForm({ category: e.target.value })}
          >
            {categories[form.type].map(category => (
              <option key={category}>{category}</option>
            ))}
          </select>

          <input
            type="date"
            value={form.transaction_date}
            onChange={e => updateForm({ transaction_date: e.target.value })}
          />

          <input
            placeholder="Poznámka"
            value={form.note}
            onChange={e => updateForm({ note: e.target.value })}
          />

          <button type="submit">
            <Plus size={18} />
            {editingItem ? 'Uložit změny' : 'Přidat'}
          </button>

          {editingItem && (
            <button type="button" className="secondary-button" onClick={cancelEdit}>
              <X size={18} />
              Zrušit
            </button>
          )}
        </form>
      </section>

      <section className="layout">
        <div className="panel">
          <h2>Položky za měsíc</h2>

          {filtered.length === 0 ? (
            <p className="muted">Zatím žádné položky.</p>
          ) : (
            <div className="list">
              {filtered.map(item => (
                <div className="row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.transaction_date} · {item.category}
                      {item.note ? ` · ${item.note}` : ''}
                    </span>
                  </div>

                  <div className={item.type === 'income' ? 'income' : 'expense'}>
                    {item.type === 'income' ? '+' : '-'} {money(item.amount)}
                  </div>

                  <button
                    className="icon"
                    type="button"
                    onClick={() => startEdit(item)}
                    title="Upravit"
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    className="icon"
                    type="button"
                    onClick={() => deleteItem(item.id)}
                    title="Smazat"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Výdaje podle kategorií</h2>

          {byCategory.length === 0 ? (
            <p className="muted">Bez výdajů.</p>
          ) : (
            byCategory.map(([category, amount]) => (
              <div className="bar-wrap" key={category}>
                <div className="bar-label">
                  <span>{category}</span>
                  <strong>{money(amount)}</strong>
                </div>

                <div className="bar">
                  <div
                    style={{
                      width: `${Math.min(100, (amount / Math.max(totals.expense, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

function Card({ icon, title, value, highlight }) {
  return (
    <div className={`card ${highlight ? 'good' : ''}`}>
      {icon}
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
