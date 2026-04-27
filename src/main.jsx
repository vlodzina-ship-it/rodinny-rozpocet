import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown, Database } from 'lucide-react'
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

function localLoad() {
  return JSON.parse(localStorage.getItem('budget_transactions') || '[]')
}

function localSave(items) {
  localStorage.setItem('budget_transactions', JSON.stringify(items))
}

function App() {
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

  async function loadItems() {
    setLoading(true)
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('budget_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
      if (error) alert(error.message)
      setItems(data || [])
    } else {
      setItems(localLoad())
    }
    setLoading(false)
  }

  useEffect(() => { loadItems() }, [])

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
    return Object.entries(map).sort((a,b) => b[1]-a[1])
  }, [filtered])

  async function addItem(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.amount) return

    const payload = {
      ...form,
      amount: Number(form.amount),
      category: form.category || categories[form.type][0],
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('budget_transactions').insert(payload)
      if (error) return alert(error.message)
      await loadItems()
    } else {
      const next = [{ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...items]
      setItems(next)
      localSave(next)
    }

    setForm({ ...form, title: '', amount: '', note: '' })
  }

  async function deleteItem(id) {
    if (!confirm('Opravdu smazat položku?')) return
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('budget_transactions').delete().eq('id', id)
      if (error) return alert(error.message)
      await loadItems()
    } else {
      const next = items.filter(i => i.id !== id)
      setItems(next)
      localSave(next)
    }
  }

  function updateForm(next) {
    const changedType = next.type && next.type !== form.type
    setForm({
      ...form,
      ...next,
      category: changedType ? categories[next.type][0] : (next.category ?? form.category),
    })
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Rodinný rozpočet</p>
          <h1>Přehled příjmů a výdajů</h1>
          <p className="muted">Jednoduchá evidence pro domácnost, měsíc po měsíci.</p>
        </div>
        <div className="status"><Database size={18}/> {isSupabaseConfigured ? 'Supabase aktivní' : 'Lokální režim'}</div>
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
