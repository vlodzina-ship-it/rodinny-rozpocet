export function exportToCSV(items) {
  if (!items || items.length === 0) {
    alert('Žádná data k exportu')
    return
  }

  const header = [
    'Název',
    'Částka',
    'Typ',
    'Kategorie',
    'Datum',
    'Poznámka'
  ]

  const rows = items.map(i => [
    i.title,
    i.amount,
    i.type === 'income' ? 'Příjem' : 'Výdaj',
    i.category,
    i.transaction_date,
    i.note || ''
  ])

  const csv = [
    header.join(';'),
    ...rows.map(r => r.join(';'))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = 'rozpocet.csv'
  a.click()

  URL.revokeObjectURL(url)
}
