import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown, Database, LogOut } from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import './style.css'

const categories = {
  income: ['Výplata', 'Podnikání', 'Přídavky', 'Dárky', 'Ostatní'],
  expense: ['Bydlení', 'Jídlo', 'Doprava', 'Děti', 'Zdraví', 'Zábava', 'Oblečení', 'Spoření', 'Ostatní'],
}

const today = new Date().toISOString().slice(0, 10)
const currentMonth = today.slice(0, 7)

function money(value) {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(Number(value || 0))
}

function App() {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [items, setItems] = useState([])
  const [month, setMonth] = useState(currentMonth)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    title: '',
    amount: '',
    type: 'expense',
    category: 'Jídlo',
    transaction_date: today,
    note: '',
  })

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) loadItems()
    else setItems([])
  }, [user])

  async function handleAuth(e) {
    e.preventDefault()

    const email = authForm.email.trim()
    const password = authForm.password

    if (!email || !password) return alert('Vyplň e-mail i heslo.')

    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    if (result.error) return alert(result.error.message)

    if (authMode === 'register') {
      alert('Registrace hotová. Teď se můžeš přihlásit.')
      setAuthMode('login')
    }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  async function loadItems() {
    setLoading(true)

    const { data, error } = await supabase
      .from('budget_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })

    if (error) alert(error.message)
    setItems(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return items.filter(item => String(item.transaction_date || '').startsWith(month))
  }, [items, month])

  const totals = useMemo(() => {
    const income = filtered.filter(i => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0)
    const expense = filtered.filter(i => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
    return { income, expense, balance: income - expense }
  }, [filtered])

  const byCategory = useMemo(() => {
    const map = {}
    for (const item of filtered.filter(i => i.type === 'expense')) {
      map[item.category] = (map[item.category] || 0) + Number(item.amount)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  async function addItem(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.amount) return

    const payload = {
      ...form,
      amount: Number(form.amount),
      category: form.category || categories[form.type][0],
      user_id: user.id,
    }

    const { error } = await supabase.from('budget_transactions').insert(payload)

    if (error) return alert(error.message)

    await loadItems()
    setForm({ ...form, title: '', amount: '', note: '' })
  }

  async function deleteItem(id) {
    if (!confirm('Opravdu smazat položku?')) return

    const { error } = await supabase
      .from('budget_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return alert(error.message)

    await loadItems()
  }

  function updateForm(next) {
    const changedType = next.type && next.type !== form.type
    setForm({
      ...form,
      ...next,
      category: changedType ? categories[next.type][0] : (next.category ?? form.category),
    })
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="app">
        <section className="panel">
          <h1>Supabase není nastavený</h1>
          <p className="muted">Zkontroluj proměnné VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY.</p>
        </section>
      </main>
    )
  }

  if (loading) {
    return <main className="app"><p>Načítám…</p></main>
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
            <button>{authMode === 'login' ? 'Přihlásit' : 'Registrovat'}</button>
          </form>

          <button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Nemáš účet? Registrovat' : 'Už máš účet? Přihlásit'}
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
          <h1>Přehled příjmů a výdajů</h1>
          <p className="muted">Přihlášen: {user.email}</p>
        </div>
        <div className="status">
          <Database size={18}/> Supabase aktivní
          <button className="logout" onClick={logout}><LogOut size={16}/> Odhlásit</button>
        </div>
      </header>

      <section className="grid cards">
        <Card icon={<TrendingUp/>} title="Příjmy" value={money(totals.income)} />
        <Card icon={<TrendingDown/>} title="Výdaje" value={money(totals.expense)} />
        <Card icon={<Wallet/>} title="Zůstatek" value={money(totals.balance)} highlight={totals.balance >= 0} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Nová položka</h2>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>

        <form className="form" onSubmit={addItem}>
          <input placeholder="Název" value={form.title} onChange={e => updateForm({ title: e.target.value })} />
          <input placeholder="Částka" type="number" min="0" step="0.01" value={form.amount} onChange={e => updateForm({ amount: e.target.value })} />
          <select value={form.type} onChange={e => updateForm({ type: e.target.value })}>
            <option value="expense">Výdaj</option>
            <option value="income">Příjem</option>
          </select>
          <select value={form.category} onChange={e => updateForm({ category: e.target.value })}>
            {categories[form.type].map(c => <option key={c}>{c}</option>)}
          </select>
          <input type="date" value={form.transaction_date} onChange={e => updateForm({ transaction_date: e.target.value })} />
          <input placeholder="Poznámka" value={form.note} onChange={e => updateForm({ note: e.target.value })} />
          <button><Plus size={18}/> Přidat</button>
        </form>
      </section>

      <section className="layout">
        <div className="panel">
          <h2>Položky za měsíc</h2>
          {loading ? <p>Načítám…</p> : filtered.length === 0 ? <p className="muted">Zatím žádné položky.</p> : (
            <div className="list">
              {filtered.map(item => (
                <div className="row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.transaction_date} · {item.category}{item.note ? ` · ${item.note}` : ''}</span>
                  </div>
                  <div className={item.type === 'income' ? 'income' : 'expense'}>
                    {item.type === 'income' ? '+' : '-'} {money(item.amount)}
                  </div>
                  <button className="icon" onClick={() => deleteItem(item.id)}><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Výdaje podle kategorií</h2>
          {byCategory.length === 0 ? <p className="muted">Bez výdajů.</p> : byCategory.map(([cat, amount]) => (
            <div className="bar-wrap" key={cat}>
              <div className="bar-label"><span>{cat}</span><strong>{money(amount)}</strong></div>
              <div className="bar"><div style={{ width: `${Math.min(100, amount / Math.max(totals.expense, 1) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function Card({ icon, title, value, highlight }) {
  return <div className={`card ${highlight ? 'good' : ''}`}>{icon}<span>{title}</span><strong>{value}</strong></div>
}

createRoot(document.getElementById('root')).render(<App />)
