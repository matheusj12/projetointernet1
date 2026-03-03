import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from './supabase';

export async function generateInventoryPDF() {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.text('Relatório de Estoque - Almoxarifado Digital', 14, 20);
    doc.setFontSize(11);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

    // Fetch data
    const { data: items } = await supabase
        .from('catalog_items')
        .select('*')
        .order('name');

    if (!items) return;

    // Table
    const tableData = items.map(item => [
        item.name,
        item.category || '-',
        item.quantity.toString(),
        item.min_quantity.toString(),
        item.unit,
        item.quantity <= item.min_quantity ? 'CRÍTICO' : 'OK'
    ]);

    (doc as any).autoTable({
        startY: 35,
        head: [['Item', 'Categoria', 'Qtd Atual', 'Qtd Mínima', 'Unidade', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [14, 165, 233] }, // accent-blue
        didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 5) {
                if (data.cell.raw === 'CRÍTICO') {
                    data.cell.styles.textColor = [239, 68, 68]; // accent-red
                    data.cell.styles.fontStyle = 'bold';
                } else {
                    data.cell.styles.textColor = [16, 185, 129]; // accent-green
                }
            }
        }
    });

    doc.save(`estoque_${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function generateWithdrawalsPDF(month?: number, year?: number) {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Relatório de Cautelas', 14, 20);
    doc.setFontSize(11);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

    // Fetch withdrawals
    let query = supabase
        .from('withdrawals')
        .select(`
            id, withdrawn_at, status, 
            technician:people!technician_id(name),
            withdrawal_items(quantity_taken, quantity_returned, catalog_item:catalog_items(name))
        `)
        .order('withdrawn_at', { ascending: false });

    if (month && year) {
        const start = new Date(year, month - 1, 1).toISOString();
        const end = new Date(year, month, 0, 23, 59, 59).toISOString();
        query = query.gte('withdrawn_at', start).lte('withdrawn_at', end);
    }

    const { data: withdrawals } = await query;

    if (!withdrawals) return;

    // Flatten data for table
    const tableData: any[][] = [];

    withdrawals.forEach((w: any) => {
        const dateStr = new Date(w.withdrawn_at).toLocaleDateString('pt-BR');
        const techName = w.technician?.name || '---';
        const wStatus = w.status === 'open' ? 'Aberto' : w.status === 'partial' ? 'Parcial' : 'Devolvido';

        if (w.withdrawal_items && w.withdrawal_items.length > 0) {
            w.withdrawal_items.forEach((item: any, idx: number) => {
                tableData.push([
                    idx === 0 ? `#${w.id}` : '',
                    idx === 0 ? dateStr : '',
                    idx === 0 ? techName : '',
                    item.catalog_item?.name || '---',
                    item.quantity_taken.toString(),
                    item.quantity_returned.toString(),
                    idx === 0 ? wStatus : ''
                ]);
            });
        }
    });

    (doc as any).autoTable({
        startY: 35,
        head: [['Ticket', 'Data', 'Técnico', 'Item', 'Retirado', 'Devolv.', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [14, 165, 233] },
        didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 6 && data.cell.raw) {
                if (data.cell.raw === 'Aberto') {
                    data.cell.styles.textColor = [239, 68, 68]; // accent-red
                    data.cell.styles.fontStyle = 'bold';
                } else if (data.cell.raw === 'Parcial') {
                    data.cell.styles.textColor = [245, 158, 11]; // accent-yellow
                    data.cell.styles.fontStyle = 'bold';
                } else {
                    data.cell.styles.textColor = [16, 185, 129]; // accent-green
                }
            }
        }
    });

    doc.save(`cautelas_${new Date().toISOString().split('T')[0]}.pdf`);
}
