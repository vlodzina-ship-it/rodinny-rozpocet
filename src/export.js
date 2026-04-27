export function exportToCSV(items) {
  if (!items || items.length === 0) {
    alert('Žádná data k exportu')
    return
  }

  const headers = [
    'Datum',
    'Název',
    'Typ',
    'Kategorie',
    'Částka',
    'Poznámka',
  ]

  const rows = items.map(item => [
    item.transaction_date || '',
    item.title || '',
    item.type === 'income' ? 'Příjem' : 'Výdaj',
    item.category || '',
    String(item.amount ?? '').replace('.', ','),
    item.note || '',
  ])

  const escapeCell = value => {
    const text = String(value)
    return `"${text.replaceAll('"', '""')}"`
  }

  const csv =
    '\uFEFF' +
    [headers, ...rows]
      .map(row => row.map(escapeCell).join(';'))
      .join('\n')

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'rozpocet.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
