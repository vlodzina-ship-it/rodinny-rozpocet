import * as XLSX from 'xlsx'

export function exportToCSV(items) {
  exportToExcel(items)
}

export function exportToExcel(items) {
  if (!items || items.length === 0) {
    alert('Žádná data k exportu')
    return
  }

  const rows = items.map(item => ({
    Datum: item.transaction_date || '',
    Název: item.title || '',
    Typ: item.type === 'income' ? 'Příjem' : 'Výdaj',
    Kategorie: item.category || '',
    Částka: Number(item.amount || 0),
    Poznámka: item.note || '',
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)

  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 30 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rozpočet')

  XLSX.writeFile(workbook, 'rozpocet.xlsx')
}
