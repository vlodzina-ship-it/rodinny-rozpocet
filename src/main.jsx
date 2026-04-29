import { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabaseClient"

export default function App() {
  const [items, setItems] = useState([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [year, setYear] = useState(new Date().getFullYear())

  // ===============================
  // LOAD DATA
  // ===============================
  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    const { data } = await supabase
      .from("budget_transactions")
      .select("*")
      .order("date", { ascending: false })

    setItems(data || [])
  }

  // ===============================
  // FILTERY
  // ===============================
  const monthlyItems = useMemo(() => {
    return items.filter((i) => i.date?.startsWith(month))
  }, [items, month])

  const yearlyItems = useMemo(() => {
    return items.filter((i) => i.date?.startsWith(String(year)))
  }, [items, year])

  // ===============================
  // VÝPOČTY
  // ===============================
  function calculateTotals(data) {
    let income = 0
    let fixed = 0
    let controllable = 0
    let extraordinary = 0

    data.forEach((i) => {
      const amount = Number(i.amount || 0)

      if (i.type === "income") income += amount
      else {
        if (i.budget_group === "fixed") fixed += amount
        if (i.budget_group === "controllable") controllable += amount
        if (i.budget_group === "extra") extraordinary += amount
      }
    })

    const totalExpenses = fixed + controllable + extraordinary
    const balance = income - totalExpenses

    return {
      income,
      fixed,
      controllable,
      extraordinary,
      totalExpenses,
      balance,
    }
  }

  const monthlyTotals = useMemo(
    () => calculateTotals(monthlyItems),
    [monthlyItems]
  )

  // ===============================
  // ROČNÍ LOGIKA (FIXNÍ × 12)
  // ===============================
  const yearlyTotals = useMemo(() => {
    const totals = calculateTotals(yearlyItems)

    const recurringMonthly = monthlyItems
      .filter((i) => i.is_recurring && i.type !== "income")
      .reduce((sum, i) => sum + Number(i.amount || 0), 0)

    const estimatedExpenses =
      (totals.totalExpenses - recurringMonthly) + recurringMonthly * 12

    return {
      ...totals,
      totalExpenses: estimatedExpenses,
      balance: totals.income - estimatedExpenses,
    }
  }, [yearlyItems, monthlyItems])

  // ===============================
  // STAV ROZPOČTU
  // ===============================
  function getStatus(balance) {
    if (balance > 0) return "Přebytkový"
    if (balance < 0) return "Schodkový"
    return "Vyrovnaný"
  }

  // ===============================
  // ALERTY
  // ===============================
  function getAlerts() {
    const alerts = []

    if (monthlyTotals.extraordinary > monthlyTotals.controllable) {
      alerts.push("⚠️ Mimořádné výdaje překročily plán")
    }

    if (monthlyTotals.balance < 0) {
      alerts.push("❗ Rozpočet je ve ztrátě")
    }

    if (monthlyTotals.balance > 0 && monthlyTotals.balance < 2000) {
      alerts.push("⚠️ Nízká rezerva")
    }

    return alerts
  }

  const alerts = getAlerts()

  // ===============================
  // UI
  // ===============================
  return (
    <div className="container">
      <h1>Přehled domácího rozpočtu</h1>

      {/* OBDOBÍ */}
      <div className="card">
        <h3>Období</h3>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </div>

      {/* ALERTY */}
      {alerts.length > 0 && (
        <div className="alert">
          <strong>Upozornění</strong>
          {alerts.map((a, i) => (
            <div key={i}>{a}</div>
          ))}
        </div>
      )}

      {/* MĚSÍC */}
      <div className="card">
        <h3>Výsledek měsíce: {getStatus(monthlyTotals.balance)}</h3>

        <div className="grid">
          <Box title="Příjmy" value={monthlyTotals.income} />
          <Box title="Pevné výdaje" value={monthlyTotals.fixed} />
          <Box title="Kontrolovatelné" value={monthlyTotals.controllable} />
          <Box title="Mimořádné" value={monthlyTotals.extraordinary} />
          <Box title="Výdaje celkem" value={monthlyTotals.totalExpenses} />
          <Box title="Zůstatek" value={monthlyTotals.balance} green />
        </div>
      </div>

      {/* ROK */}
      <div className="card">
        <h3>Celkem v roce {year}</h3>

        <div className="grid">
          <Box title="Příjmy za rok" value={yearlyTotals.income} />
          <Box title="Výdaje za rok" value={yearlyTotals.totalExpenses} />
          <Box title="Zůstatek" value={yearlyTotals.balance} green />
        </div>
      </div>

      {/* SEZNAM */}
      <div className="card">
        <h3>Položky za měsíc</h3>

        {monthlyItems.map((i) => (
          <div key={i.id} className="row">
            <span>{i.name}</span>
            <span>{i.budget_group}</span>
            <span
              style={{
                color: i.type === "income" ? "green" : "red",
              }}
            >
              {i.amount} Kč
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===============================
// BOX KOMPONENTA
// ===============================
function Box({ title, value, green }) {
  return (
    <div className="box">
      <div>{title}</div>
      <strong style={{ color: green ? "green" : "black" }}>
        {Number(value).toLocaleString("cs-CZ")} Kč
      </strong>
    </div>
  )
}
