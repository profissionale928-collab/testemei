// Configurações da API
const API_BASE_URL = 'https://api.cnpja.com/office';
const API_KEY = 'e3eba6c7-ceee-42b8-99b9-2565102a6bc3-44d3856b-603a-4d0c-9a28-a57dbfd43724';

// Elementos do DOM
const searchForm = document.getElementById('searchForm' );
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const debugInfo = document.getElementById('debugInfo');
const requestUrlSpan = document.getElementById('requestUrl');
const apiResponseSpan = document.getElementById('apiResponse');
const resultsContainer = document.getElementById('resultsContainer');
const noResults = document.getElementById('noResults');
const tableBody = document.getElementById('tableBody');
const resultCount = document.getElementById('resultCount');
const btnSearch = document.querySelector('.btn-search');

// Variável global para armazenar todos os resultados
let allResults = [];

// Função principal de busca
async function handleSearch(e) {
    e.preventDefault();

    // Validação de datas
    const inicio = new Date(dataInicio.value);
    const fim = new Date(dataFim.value);

    if (inicio > fim) {
        showError('A data de início não pode ser maior que a data de fim.');
        return;
    }

    // Limpar resultados anteriores
    clearResults();
    allResults = []; // Limpa resultados globais
    
    // Ocultar debug
    debugInfo.classList.add('hidden');

    // Mostrar spinner de carregamento
    showLoading(true);
    btnSearch.disabled = true;

    try {
        // Formatar datas para ISO 8601, ajustando para incluir o horário para precisão.
        const dataInicioISO = `${dataInicio.value}T00:00:00Z`;
        const dataFimISO = `${dataFim.value}T23:59:59Z`;

        // Construir URL com parâmetros, solicitando um limite alto (10000)
        const params = new URLSearchParams({
            'founded.gte': dataInicioISO,
            'founded.lte': dataFimISO,
            'company.simei.optant.eq': 'true', // Filtro MEI reativado
            'limit': '1000' // Limite máximo solicitado
        });

        const url = `${API_BASE_URL}?${params.toString()}`;
        requestUrlSpan.textContent = url;
        debugInfo.classList.remove('hidden');

        // Fazer requisição à API
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            apiResponseSpan.textContent = `Status: ${response.status}. Resposta: ${errorText}`;
            throw new Error(`Erro na API: ${response.status} - ${response.statusText}. Detalhes no console e na seção de debug.`);
        }

        const data = await response.json();
        apiResponseSpan.textContent = JSON.stringify(data, null, 2).substring(0, 500) + '...'; // Limita o tamanho do log

        // Processar resultados
        if (data.records && data.records.length > 0) {
            allResults = data.records; // Armazena todos os resultados
            displayResults(allResults); // Exibe os resultados
        } else {
            showNoResults();
        }
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        showError(`Erro ao buscar dados: ${error.message}`);
    } finally {
        showLoading(false);
        btnSearch.disabled = false;
    }
}

// Função de utilidade para extrair o telefone de um registro
function extractPhone(empresa) {
    let phone = 'N/A';
    // Tenta extrair o telefone de diferentes campos
    const phoneData = empresa.company?.phone || empresa.phones?.[0] || empresa.phone;

    if (typeof phoneData === 'string' && phoneData.trim() !== '') {
        phone = phoneData;
    } else if (phoneData && typeof phoneData === 'object') {
        // A API CNPJjá pode retornar um objeto de telefone com 'number' e 'countryCode'
        if (phoneData.number) {
            // Formata o número de telefone, se possível
            phone = formatarTelefone(phoneData.number, phoneData.countryCode);
        } else if (phoneData.value) {
            phone = formatarTelefone(phoneData.value);
        }
    } else if (Array.isArray(empresa.phones) && empresa.phones.length > 0) {
        const firstPhone = empresa.phones[0];
        if (typeof firstPhone === 'string' && firstPhone.trim() !== '') {
            phone = formatarTelefone(firstPhone);
        } else if (firstPhone && (firstPhone.number || firstPhone.value)) {
            phone = formatarTelefone(firstPhone.number || firstPhone.value, firstPhone.countryCode);
        }
    }
    return phone;
}

// Função de utilidade para extrair o email de um registro
function extractEmail(empresa) {
    let email = 'N/A';
    // Tenta extrair o email de diferentes campos
    const emailData = empresa.company?.email || empresa.emails?.[0] || empresa.email;

    if (typeof emailData === 'string' && emailData.trim() !== '') {
        email = emailData;
    } else if (emailData && typeof emailData === 'object' && (emailData.address || emailData.value)) {
        email = emailData.address || emailData.value;
    } else if (Array.isArray(empresa.emails) && empresa.emails.length > 0) {
        const firstEmail = empresa.emails[0];
        if (typeof firstEmail === 'string' && firstEmail.trim() !== '') {
            email = firstEmail;
        } else if (firstEmail && (firstEmail.address || firstEmail.value)) {
            email = firstEmail.address || firstEmail.value;
        }
    }
    return email;
}

// Função para exportar dados completos (CNPJ, Razão Social, Email, Telefone, etc) para CSV
function exportData() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    // Cria o cabeçalho do CSV
    const header = ['CNPJ', 'Razão Social', 'Email', 'Telefone', 'Data de Abertura', 'Status'].join(';');
    
    const dataLines = allResults.map(empresa => {
        const cnpj = empresa.taxId || 'N/A';
        const razaoSocial = empresa.company?.name || 'N/A';
        const email = extractEmail(empresa);
        const telefone = extractPhone(empresa); // Novo campo
        const dataAbertura = formatarData(empresa.founded);
        const status = empresa.status?.text || 'N/A';

        // Usa aspas duplas para encapsular campos que podem conter o separador (e-mail, razão social)
        return [
            `"${formatarCNPJ(cnpj)}"`,
            `"${razaoSocial}"`,
            `"${email}"`,
            `"${telefone}"`,
            `"${dataAbertura}"`,
            `"${status}"`
        ].join(';');
    });

    const csvContent = [header, ...dataLines].join('\n');
    
    // Cria um Blob para download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Cria um link temporário para iniciar o download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'empresas_mei_export.csv';
    document.body.appendChild(a);
    a.click();
    
    // Limpa o link temporário e o URL do objeto
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação concluída! ${allResults.length} registro(s) exportado(s) para "empresas_mei_export.csv".`);
}

// Função para exportar emails (mantida para compatibilidade, mas agora chama exportData)
function exportEmails() {
    exportData();
}

// Função para exibir resultados
function exportEmails() {
    if (allResults.length === 0) {
        alert('Nenhum resultado para exportar.');
        return;
    }

    const emails = allResults
        .map(empresa => extractEmail(empresa))
        .filter(email => email !== 'N/A');

    if (emails.length === 0) {
        alert('Nenhum email válido encontrado para exportar.');
        return;
    }

    const emailsText = emails.join('\n');
    
    // Cria um Blob para download
    const blob = new Blob([emailsText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Cria um link temporário para iniciar o download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'emails_mei_export.txt';
    document.body.appendChild(a);
    a.click();
    
    // Limpa o link temporário e o URL do objeto
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Exportação concluída! ${emails.length} e-mail(s) exportado(s) para "emails_mei_export.txt".`);
}

// Função para exibir resultados
function displayResults(results) {
    // Limpar tabela
    tableBody.innerHTML = '';

    // Adicionar linhas à tabela
    results.forEach((empresa, index) => {
        const row = document.createElement('tr');
        
        // Extrair dados
        const cnpj = empresa.taxId || 'N/A';
        const razaoSocial = empresa.company?.name || 'N/A';
        const email = extractEmail(empresa); // Usa a função de utilidade
        const telefone = extractPhone(empresa); // Novo campo
        const dataAbertura = formatarData(empresa.founded);
        const status = empresa.status?.text || 'N/A';
        const statusClass = status === 'Ativa' ? 'status-active' : 'status-inactive';

        row.innerHTML = `
            <td><strong>${formatarCNPJ(cnpj)}</strong></td>
            <td>${razaoSocial}</td>
            <td><a href="mailto:${email}">${email}</a></td>
            <td>${telefone}</td>
            <td>${dataAbertura}</td>
            <td><span class="${statusClass}">${status}</span></td>
        `;

        tableBody.appendChild(row);
    });

    // Atualizar contagem de resultados
    resultCount.textContent = `${results.length} empresa(s) encontrada(s)`;

    // Adiciona o botão de exportar emails
    const exportButton = document.getElementById('btnExportEmails');
    if (exportButton) {
        exportButton.classList.remove('hidden');
    }

    // Mostrar container de resultados
    resultsContainer.classList.remove('hidden');
    noResults.classList.add('hidden');
    debugInfo.classList.add('hidden'); // Oculta a seção de debug após o sucesso
}

// Função para exibir mensagem de nenhum resultado
function showNoResults() {
    resultsContainer.classList.add('hidden');
    noResults.classList.remove('hidden');
    debugInfo.classList.add('hidden');
}

// Função para exibir erro
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    debugInfo.classList.add('hidden');
}

// Função para limpar resultados
function clearResults() {
    tableBody.innerHTML = '';
    errorMessage.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    noResults.classList.add('hidden');
    debugInfo.classList.add('hidden');
    // Oculta o botão de exportar
    const exportButton = document.getElementById('btnExportEmails');
    if (exportButton) {
        exportButton.classList.add('hidden');
    }
}

// Função para mostrar/ocultar spinner
function showLoading(show) {
    if (show) {
        loadingSpinner.classList.remove('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
}

// Função para formatar telefone
function formatarTelefone(numero, countryCode = '55') {
    if (!numero) return 'N/A';
    
    // Remove tudo que não é dígito
    const numLimpo = numero.replace(/\D/g, '');
    
    if (numLimpo.length === 0) return 'N/A';

    // Tenta formatar como telefone brasileiro (DDD + 8 ou 9 dígitos)
    if (numLimpo.length >= 8) {
        // Exemplo: 11999999999 -> (11) 99999-9999
        // Exemplo: 1188888888 -> (11) 8888-8888
        const ddd = numLimpo.substring(0, 2);
        let parte1, parte2;
        
        if (numLimpo.length === 11) { // Celular com 9 dígitos
            parte1 = numLimpo.substring(2, 7);
            parte2 = numLimpo.substring(7, 11);
            return `(${ddd}) ${parte1}-${parte2}`;
        } else if (numLimpo.length === 10) { // Fixo ou celular antigo
            parte1 = numLimpo.substring(2, 6);
            parte2 = numLimpo.substring(6, 10);
            return `(${ddd}) ${parte1}-${parte2}`;
        }
    }
    
    // Se não for possível formatar como BR, retorna o número limpo
    return numLimpo;
}

// Função para formatar CNPJ
function formatarCNPJ(cnpj) {
    if (!cnpj || cnpj === 'N/A') return cnpj;
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return cnpj;
    return `${cnpjLimpo.substring(0, 2)}.${cnpjLimpo.substring(2, 5)}.${cnpjLimpo.substring(5, 8)}/${cnpjLimpo.substring(8, 12)}-${cnpjLimpo.substring(12)}`;
}

// Função para formatar data
function formatarData(data) {
    if (!data || data === 'N/A') return data;
    try {
        const date = new Date(data);
        return date.toLocaleDateString('pt-BR');
    } catch (error) {
        return data;
    }
}

// Definir data padrão (últimos 6 meses)
function setDefaultDates() {
    const hoje = new Date();
    // Define o período padrão para os últimos 6 meses (aprox. 180 dias)
    const seisMeses = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000);

    dataFim.value = hoje.toISOString().split('T')[0];
    dataInicio.value = seisMeses.toISOString().split('T')[0];
}

// Inicializar com datas padrão
setDefaultDates();

// Event Listeners
searchForm.addEventListener('submit', handleSearch);
// Adiciona o listener para o novo botão de exportar
document.addEventListener('click', function(e) {
    if (e.target.id === 'btnExportEmails') {
        exportData(); // Usa a nova função de exportação
    }
});

// Ocultar o botão de exportar no início
document.addEventListener('DOMContentLoaded', () => {
    const exportButton = document.getElementById('btnExportEmails');
    if (exportButton) {
        exportButton.classList.add('hidden');
    }
});
