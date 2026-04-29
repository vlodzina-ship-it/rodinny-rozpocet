import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabaseClient"

export default function App() {
  const [items, setItems] = useState([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    const { data, error } = await supabase
      .from("budget_transactions")
      .select("*")
      .order("date", { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setItems(data || [])
  }

  const monthlyItems = useMemo(() => {
    return items.filter((i) => i.date?.startsWith(month))
  }, [items, month])

  const yearlyItems = useMemo(() => {
    return items.filter((i) => i.date?.startsWith(String(year)))
  }, [items, year])

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

  return (
    <div style={{ padding: 20 }}>
      <h1>Rozpočet</h1>

      <h3>Měsíc</h3>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />

      <h3>Rok</h3>
      <input
        type="number"
        value={year}
        onChange={(e) => setYear(e.target.value)}
      />

      <hr />

      <h2>Měsíční</h2>
      <p>Příjmy: {monthlyTotals.income}</p>
      <p>Výdaje: {monthlyTotals.totalExpenses}</p>
      <p>Zůstatek: {monthlyTotals.balance}</p>

      <h2>Roční</h2>
      <p>Příjmy: {yearlyTotals.income}</p>
      <p>Výdaje: {yearlyTotals.totalExpenses}</p>
      <p>Zůstatek: {yearlyTotals.balance}</p>
    </div>
  )
}
