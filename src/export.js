function exportCSV() {
  if (filtered.length === 0) {
    alert('Žádná data k exportu')
    return
  }

  // HLAVIČKA
  const headers = ['Datum', 'Název', 'Typ', 'Kategorie', 'Částka', 'Poznámka']

  // DATA
  const rows = filtered.map(item => [
    item.transaction_date,
    item.title,
    item.type === 'income' ? 'Příjem' : 'Výdaj',
    item.category,
    item.amount,
    item.note || ''
  ])

  // 👉 důležité: použijeme STŘEDNÍK místo čárky
  const csvContent =
    '\uFEFF' + // správné kódování pro Excel (UTF-8)
    [headers, ...rows]
      .map(row => row.join(';'))
      .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `rozpocet-${month}.csv`
  a.click()

  URL.revokeObjectURL(url)
}
