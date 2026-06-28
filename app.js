/* ==========================================================================
   AquaConsciente - Lógica da Aplicação (Vanilla JS)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
// --- Estado da Aplicação ---
let state = {
    // Cadastro da Residência
    residents: 3,
    residenceType: 'casa',
    hasGarden: false,
    hasPool: false,
    
    // Configurações e Parâmetros
    savingsTarget: 15, // em %
    waterTariff: 8.50, // em R$ por m³ (1000L)
    tarifaMode: 'simples', // 'simples' | 'progressiva'
    tarifaBlocos: [
        { ate: 10000,  tarifa: 6.00  }, // até 10 m³: R$ 6,00/m³
        { ate: 20000,  tarifa: 8.50  }, // de 10 a 20 m³: R$ 8,50/m³
        { ate: 50000,  tarifa: 12.00 }, // de 20 a 50 m³: R$ 12,00/m³
        { ate: Infinity, tarifa: 15.00 } // acima de 50 m³: R$ 15,00/m³
        // Valores de referência Sanepar/Curitiba (2024). Usuário pode editar na tela de configurações.
    ],
    
    // Dados Registrados
    registeredBills: [], // { id, mes, consumoReal (m³), valorPago (R$) }
    weeklyActivities: [], // { id, type, name, liters, cost, date, week }
    currentWeek: 1,       // semana ativa para registro (1 a 4)
    selectedWeek: 1,      // semana selecionada para visualização na gota (1 a 4)
    
    // Ciclo Mensal
    isMonthFinished: false,
    monthlyHistory: [],   // { id, period, consumoBase, consumoAdicional, consumoTotal, valorEstimado, valorReal, consumoReal, diferencaLitros, diferencaReais, situacaoMeta }
    monthOffset: 0,
    cycleState: 'EM_ANDAMENTO',

    
    // Hábitos Atuais Cadastrados (para o Simulador)
    currentHabits: {
        banho: 5,
        carro: 2,
        jardim: 4
    },
    
    // Status de Inicialização e Onboarding
    initialized: false,
    currentOnboardingSlide: 0
};

// --- Dados de Referência Técnica (Consumo) ---
const CONSUMO_REFERENCIA = {
    baselinePerPersonDay: 120, // 120 litros/dia (Recomendação ONU/Sabesp básica)
    gardenWatering: 150,       // 150 litros por rega (mangueira)
    poolFill: 1000,            // 1000 litros (para ajustes/evaporação)
    
    // Atividades Avulsas
    activities: {
        banho: { name: 'Banho Longo (>15min)', liters: 180 },
        roupa: { name: 'Lavar Roupa (Máquina)', liters: 120 },
        carro: { name: 'Lavar Carro (Mangueira)', liters: 220 },
        jardim: { name: 'Regar Jardim (Mangueira)', liters: 150 },
        // [FIX-4] Calçada: corrigir valor subestimado de 100 L para 180 L
        calcada: {
            name: 'Lavar Calçada (Mangueira)',
            liters: 180,
            descricao: 'Uso de mangueira por aproximadamente 5 minutos (~180 L)'
        },
        // [FIX-1] Piscina: separar "Encher do Zero" de "Reposição Semanal"
        piscina_reposicao: {
            name: 'Piscina — Reposição Semanal',
            liters: 1000,
            descricao: 'Reposição por evaporação e respingo (~1.000 L/semana)'
        },
        piscina_encher: {
            name: 'Piscina — Encher do Zero',
            liters: 36000,
            descricao: 'Enchimento completo de piscina residencial padrão (~36.000 L)'
        }
    }
};

// Atividade atualmente selecionada no fluxo de registro
let selectedActivityType = null;
// Tipo de residência selecionado no cadastro (card)
let selectedResidenceType = null;

// --- Inicialização da Aplicação ---
    loadStateFromStorage();
    setupEventListeners();
    
    // Decidir tela inicial com base no cadastro existente
    if (state.initialized) {
        navigateTo('screen-dashboard');
        renderDashboard();
    } else {
        navigateTo('screen-splash');
    }

// --- Persistência Local (localStorage) ---
function saveStateToStorage() {
    try {
        localStorage.setItem('aquaconsciente_state', JSON.stringify(state));
    } catch (e) {
        console.warn('Não foi possível salvar o estado no LocalStorage:', e);
    }
}

function loadStateFromStorage() {
    try {
        const saved = localStorage.getItem('aquaconsciente_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            
            // Mesclar estado padrão com o estado carregado para assegurar todos os campos
            state = { ...state, ...parsed };
            
            // Garantir que os campos de tarifa existem
            if (state.tarifaMode === undefined) {
                state.tarifaMode = 'simples';
            }
            if (!state.tarifaBlocos) {
                state.tarifaBlocos = [
                    { ate: 10000,  tarifa: 6.00  }, // até 10 m³: R$ 6,00/m³
                    { ate: 20000,  tarifa: 8.50  }, // de 10 a 20 m³: R$ 8,50/m³
                    { ate: 50000,  tarifa: 12.00 }, // de 20 a 50 m³: R$ 12,00/m³
                    { ate: Infinity, tarifa: 15.00 } // acima de 50 m³: R$ 15,00/m³
                ];
            }
            
            // Garantir que as listas essenciais são arrays válidos
            if (!state.weeklyActivities || !Array.isArray(state.weeklyActivities)) {
                state.weeklyActivities = [];
            }
            if (!state.registeredBills || !Array.isArray(state.registeredBills)) {
                state.registeredBills = [];
            }
            if (!state.monthlyHistory || !Array.isArray(state.monthlyHistory)) {
                state.monthlyHistory = [];
            }
            if (!state.currentHabits) {
                state.currentHabits = { banho: 5, carro: 2, jardim: 4 };
            }
            
            // Garantir que os campos de semanas existem e estão consistentes
            if (state.currentWeek === undefined) {
                state.currentWeek = 1;
            }
            // A semana selecionada sempre reinicia na semana atual
            state.selectedWeek = state.currentWeek;
            
            state.weeklyActivities.forEach(act => {
                if (act.week === undefined) {
                    act.week = 1;
                }
                if (act.type === 'piscina') {
                    act.type = 'piscina_reposicao';
                }
            });
            
            // Garantir campos do ciclo mensal
            if (state.isMonthFinished === undefined) {
                state.isMonthFinished = false;
            }
            if (state.monthOffset === undefined) {
                state.monthOffset = 0;
            }
            if (state.cycleState === undefined) {
                if (state.isMonthFinished) {
                    const dataAtual = new Date();
                    if (state.monthOffset) {
                        dataAtual.setMonth(dataAtual.getMonth() + state.monthOffset);
                    }
                    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                    const currentPeriod = `${meses[dataAtual.getMonth()]} de ${dataAtual.getFullYear()}`;
                    const completedBill = state.monthlyHistory.find(h => h.period === currentPeriod);
                    state.cycleState = completedBill ? 'COMPARACAO_DISPONIVEL' : 'AGUARDANDO_CONTA_REAL';
                } else {
                    state.cycleState = 'EM_ANDAMENTO';
                }
            }
        }
    } catch (e) {
        console.warn('LocalStorage não está acessível. O estado será mantido apenas em memória nesta sessão:', e);
    }
}

function resetAllData() {
    try {
        localStorage.removeItem('aquaconsciente_state');
    } catch (e) {
        console.warn('Não foi possível remover o estado do LocalStorage:', e);
    }
    state = {
        residents: 3,
        residenceType: 'casa',
        hasGarden: false,
        hasPool: false,
        savingsTarget: 15,
        waterTariff: 8.50,
        tarifaMode: 'simples',
        tarifaBlocos: [
            { ate: 10000,  tarifa: 6.00  },
            { ate: 20000,  tarifa: 8.50  },
            { ate: 50000,  tarifa: 12.00 },
            { ate: Infinity, tarifa: 15.00 }
        ],
        registeredBills: [],
        weeklyActivities: [],
        isMonthFinished: false,
        monthlyHistory: [],
        monthOffset: 0,
        cycleState: 'EM_ANDAMENTO',
        currentHabits: {
            banho: 5,
            carro: 2,
            jardim: 4
        },
        currentWeek: 1,
        selectedWeek: 1,
        initialized: false,
        currentOnboardingSlide: 0
    };
    navigateTo('screen-splash');
}

// [FIX-3] Tarifa: adicionar suporte a blocos progressivos
function calcularCustoAgua(litros) {
    if (state.tarifaMode === 'simples') {
        // Modo simples: tarifa única configurada pelo usuário
        return (litros / 1000) * state.waterTariff;
    }

    // Modo progressivo: aplica blocos tarifários em cascata
    let custo = 0;
    let litrosRestantes = litros;
    let limiteAnterior = 0;

    for (const bloco of state.tarifaBlocos) {
        const limiteBloco = bloco.ate; // já em litros
        const litrosNesteBloco = Math.min(litrosRestantes, limiteBloco - limiteAnterior);

        if (litrosNesteBloco <= 0) break;

        custo += (litrosNesteBloco / 1000) * bloco.tarifa;
        litrosRestantes -= litrosNesteBloco;
        limiteAnterior = limiteBloco;

        if (litrosRestantes <= 0) break;
    }

    return custo;
}

// --- Roteador de Telas (Navigation) ---
function navigateTo(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        if (screen.id === screenId) {
            screen.classList.remove('hidden');
            screen.classList.add('active');
        } else {
            screen.classList.remove('active');
            screen.classList.add('hidden');
        }
    });

    // Se estiver navegando para o dashboard ou abas, atualizar barra ativa
    if (screenId === 'screen-dashboard') {
        updateBottomNavActive('dashboard');
    } else if (screenId === 'screen-simulador') {
        updateBottomNavActive('simulador');
        initSimulator();
    } else if (screenId === 'screen-historico') {
        updateBottomNavActive('historico');
        renderHistory();
    } else if (screenId === 'screen-configuracoes') {
        updateBottomNavActive('configuracoes');
        initSettingsForm();
    } else if (screenId === 'screen-conta-real') {
        const selectMesEl = document.getElementById('input-conta-mes');
        if (selectMesEl) {
            const meses = [
                "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
            ];
            selectMesEl.value = meses[getCurrentDate().getMonth()];
        }
    }
}

function updateBottomNavActive(navName) {
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-nav') === navName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// --- Configuração dos Event Listeners ---
function setupEventListeners() {
    
    // --- TELA SPLASH ---
    document.getElementById('btn-splash-start').addEventListener('click', () => {
        navigateTo('screen-cadastro');
    });

    document.getElementById('btn-splash-onboarding').addEventListener('click', () => {
        state.currentOnboardingSlide = 0;
        updateOnboardingSlide();
        navigateTo('screen-onboarding');
    });

    // --- TELA ONBOARDING ---
    const slides = document.querySelectorAll('.onboarding-slide');
    const dots = document.querySelectorAll('.onboarding-indicators .dot');
    
    document.getElementById('btn-onboarding-next').addEventListener('click', () => {
        if (state.currentOnboardingSlide < slides.length - 1) {
            state.currentOnboardingSlide++;
            updateOnboardingSlide();
        } else {
            // Último slide, ir para cadastro
            navigateTo('screen-cadastro');
        }
    });

    document.getElementById('btn-onboarding-skip').addEventListener('click', () => {
        navigateTo('screen-cadastro');
    });

    dots.forEach((dot, idx) => {
        dot.addEventListener('click', () => {
            state.currentOnboardingSlide = idx;
            updateOnboardingSlide();
        });
    });

    // --- TELA CADASTRO ---
    document.getElementById('btn-cadastro-back').addEventListener('click', () => {
        if (state.initialized) {
            navigateTo('screen-dashboard');
        } else {
            navigateTo('screen-splash');
        }
    });

    // Controles de Moradores
    const inputMoradores = document.getElementById('input-moradores');
    document.getElementById('btn-moradores-dec').addEventListener('click', () => {
        let val = parseInt(inputMoradores.value);
        if (val > 1) inputMoradores.value = val - 1;
    });
    document.getElementById('btn-moradores-inc').addEventListener('click', () => {
        let val = parseInt(inputMoradores.value);
        if (val < 20) inputMoradores.value = val + 1;
    });

    // Seleção de Cartões de Residência
    const resCards = document.querySelectorAll('.residence-card');
    const submitBtn = document.getElementById('btn-cadastro-submit');
    
    resCards.forEach(card => {
        card.addEventListener('click', () => {
            resCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedResidenceType = card.getAttribute('data-val');
            submitBtn.disabled = false;
            
            // Sugestão IHC: Pré-preencher a quantidade sugerida de moradores
            const inputMoradores = document.getElementById('input-moradores');
            if (selectedResidenceType.includes('pequena')) {
                inputMoradores.value = 2;
            } else if (selectedResidenceType.includes('media')) {
                inputMoradores.value = 3;
            } else if (selectedResidenceType.includes('grande')) {
                inputMoradores.value = 5;
            }
        });
    });

    // Toggles de botões do cadastro (jardim/piscina)
    setupToggleGroup('group-jardim');
    setupToggleGroup('group-piscina');

    // Modal de Informação de Referência (IHC)
    const refModal = document.getElementById('modal-reference-info');
    document.getElementById('btn-open-reference-modal').addEventListener('click', () => {
        refModal.classList.add('active');
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        refModal.classList.remove('active');
    });
    document.getElementById('btn-close-modal-ok').addEventListener('click', () => {
        refModal.classList.remove('active');
    });

    // Submit Cadastro
    document.getElementById('form-cadastro').addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!selectedResidenceType) return;
        
        state.residents = parseInt(document.getElementById('input-moradores').value);
        state.residenceType = selectedResidenceType;
        state.hasGarden = getActiveToggleValue('group-jardim') === 'true';
        state.hasPool = getActiveToggleValue('group-piscina') === 'true';
        
        // Inicializar hábitos atuais sugeridos com base nos moradores e jardim (IHC/UX)
        state.currentHabits = {
            banho: state.residents <= 2 ? 3 : (state.residents <= 4 ? 5 : 8),
            carro: 2,
            jardim: state.hasGarden ? 4 : 0
        };
        
        state.initialized = true;
        saveStateToStorage();
        
        navigateTo('screen-dashboard');
        renderDashboard();
    });

    // --- TELA DASHBOARD ---
    const btnGoConfigs = document.getElementById('btn-go-configs');
    if (btnGoConfigs) {
        btnGoConfigs.addEventListener('click', () => {
            navigateTo('screen-configuracoes');
        });
    }

    const btnDashContaReal = document.getElementById('btn-dash-conta-real');
    if (btnDashContaReal) {
        btnDashContaReal.addEventListener('click', () => {
            navigateTo('screen-conta-real');
        });
    }

    const btnDashHistorico = document.getElementById('btn-dash-historico');
    if (btnDashHistorico) {
        btnDashHistorico.addEventListener('click', () => {
            navigateTo('screen-historico');
        });
    }

    const btnFinalizarMes = document.getElementById('btn-finalizar-mes');
    if (btnFinalizarMes) {
        btnFinalizarMes.addEventListener('click', () => {
            finalizarMes();
        });
    }

    const btnNextStepConta = document.getElementById('btn-next-step-conta');
    if (btnNextStepConta) {
        btnNextStepConta.addEventListener('click', () => {
            navigateTo('screen-conta-real');
        });
    }

    document.getElementById('fab-add-atividade').addEventListener('click', () => {
        // Resetar seleção anterior
        selectedActivityType = null;
        document.querySelectorAll('.activity-option').forEach(opt => opt.classList.remove('active'));
        document.getElementById('activity-preview-panel').classList.add('hidden');
        navigateTo('screen-registro-semanal');
    });

    // Botões Bottom Nav
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const dest = item.getAttribute('data-nav');
            if (dest === 'dashboard') navigateTo('screen-dashboard');
            else if (dest === 'simulador') navigateTo('screen-simulador');
            else if (dest === 'historico') navigateTo('screen-historico');
            else if (dest === 'configuracoes') navigateTo('screen-configuracoes');
        });
    });

    // --- TELA REGISTRO SEMANAL ---
    document.getElementById('btn-registro-back').addEventListener('click', () => {
        navigateTo('screen-dashboard');
    });

    // Seleção de Atividades
    document.querySelectorAll('.activity-option').forEach(opt => {
        opt.addEventListener('click', () => {
            // Desativar outras
            document.querySelectorAll('.activity-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            
            selectedActivityType = opt.getAttribute('data-activity');
            updateActivityPreview(selectedActivityType);
        });
    });

    document.getElementById('btn-confirmar-atividade').addEventListener('click', () => {
        if (!selectedActivityType) return;
        
        // TODO: atualizar HTML correspondente (opção piscina foi dividida em piscina_reposicao e piscina_encher no HTML)
        let key = selectedActivityType;
        if (key === 'piscina') {
            key = 'piscina_reposicao';
        }
        const actData = CONSUMO_REFERENCIA.activities[key];
        const cost = calcularCustoAgua(actData.liters);
        
        state.weeklyActivities.push({
            id: Date.now().toString(),
            type: key,
            name: actData.name,
            liters: actData.liters,
            cost: cost,
            date: new Date().toLocaleDateString('pt-BR'),
            week: state.currentWeek
        });
        
        // Sincronizar exibição com a semana do registro
        state.selectedWeek = state.currentWeek;
        
        saveStateToStorage();
        navigateTo('screen-dashboard');
        renderDashboard();
    });

    // --- TELA CONTA REAL ---
    document.getElementById('btn-conta-back').addEventListener('click', () => {
        navigateTo('screen-dashboard');
    });

    document.getElementById('form-conta-real').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const consumoM3 = parseFloat(document.getElementById('input-conta-consumo').value);
        const valorPago = parseFloat(document.getElementById('input-conta-valor').value);
        const mes = document.getElementById('input-conta-mes').value;
        
        state.registeredBills.push({
            id: Date.now().toString(),
            mes: mes,
            consumoReal: consumoM3,
            valorPago: valorPago
        });
        
        // Se o mês estiver concluído, consolidar no histórico com os detalhes estimados e transitar estado
        if (state.cycleState === 'AGUARDANDO_CONTA_REAL') {
            const metrics = calculateLarMetrics();
            const consumoBaseMensal = metrics.consumoMensalBaseLitros;
            const consumoAdicionalMensal = state.weeklyActivities.reduce((sum, act) => sum + act.liters, 0);
            const consumoTotalEstimado = consumoBaseMensal + consumoAdicionalMensal;
            // [FIX-3] Tarifa: usar a função calcularCustoAgua
            const valorEstimadoConta = calcularCustoAgua(consumoTotalEstimado);
            
            const consumoRealLitros = consumoM3 * 1000;
            const diferencaLitros = consumoRealLitros - consumoTotalEstimado;
            const diferencaReais = valorPago - valorEstimadoConta;
            
            const periodLabel = `${mes} de ${getCurrentDate().getFullYear()}`;
            
            // Filtrar registros antigos do mesmo período
            state.monthlyHistory = state.monthlyHistory.filter(h => h.period !== periodLabel);
            
            // [FIX-8] Situação da meta no histórico: critério dinâmico com base no percentual do usuário
            const metaEconomiaLitros = consumoBaseMensal * (state.savingsTarget / 100);
            const consumoMetaMaximo = consumoBaseMensal + metaEconomiaLitros;
            
            // Verificar situação: total estimado deve ser menor que base + tolerância da meta
            const dentroMeta = consumoTotalEstimado <= consumoMetaMaximo;
            
            state.monthlyHistory.push({
                id: Date.now().toString(),
                period: periodLabel,
                consumoBase: consumoBaseMensal,
                consumoAdicional: consumoAdicionalMensal,
                consumoTotal: consumoTotalEstimado,
                valorEstimado: valorEstimadoConta,
                valorReal: valorPago,
                consumoReal: consumoRealLitros,
                diferencaLitros: diferencaLitros,
                diferencaReais: diferencaReais,
                metaLitros: metaEconomiaLitros,             // salvar a meta em litros para exibição futura
                situacaoMeta: dentroMeta ? "Dentro da Meta" : "Acima da Meta"
            });
            
            state.cycleState = 'COMPARACAO_DISPONIVEL';
        }
        
        saveStateToStorage();
        
        // Limpar form
        document.getElementById('input-conta-consumo').value = '';
        document.getElementById('input-conta-valor').value = '';
        
        navigateTo('screen-dashboard');
        renderDashboard();
    });

    // --- TELA SIMULADOR DE ECONOMIA ---
    const sliders = [
        'slider-sim-banho', 
        'slider-sim-carro', 
        'slider-sim-jardim',
        'slider-sim-roupa',
        'slider-sim-calcada',
        'slider-sim-piscina'
    ];
    sliders.forEach(id => {
        const sliderEl = document.getElementById(id);
        if (sliderEl) {
            sliderEl.addEventListener('input', () => {
                updateSimulatorCalculations();
            });
        }
    });

    // --- TELA CONFIGURAÇÕES ---
    document.getElementById('btn-config-edit-lar').addEventListener('click', () => {
        // Preencher form de cadastro com valores do estado e navegar
        document.getElementById('input-moradores').value = state.residents;
        
        // Pré-selecionar o card salvo no estado
        selectedResidenceType = state.residenceType;
        const resCards = document.querySelectorAll('.residence-card');
        resCards.forEach(c => {
            if (c.getAttribute('data-val') === state.residenceType) {
                c.classList.add('selected');
            } else {
                c.classList.remove('selected');
            }
        });
        document.getElementById('btn-cadastro-submit').disabled = !selectedResidenceType;
        
        setToggleActiveValue('group-jardim', state.hasGarden ? 'true' : 'false');
        setToggleActiveValue('group-piscina', state.hasPool ? 'true' : 'false');
        navigateTo('screen-cadastro');
    });

    document.getElementById('btn-config-reset').addEventListener('click', () => {
        const confirmReset = confirm("Tem certeza de que deseja apagar permanentemente todos os seus dados e configurações do AquaConsciente?");
        if (confirmReset) {
            resetAllData();
        }
    });

    document.getElementById('form-configuracoes').addEventListener('submit', (e) => {
        e.preventDefault();
        
        state.savingsTarget = parseInt(document.getElementById('input-config-meta').value);
        state.waterTariff = parseFloat(document.getElementById('input-config-tarifa').value);
        
        // [FIX-9] Recálculo de custos ao salvar configurações: preservado o custo histórico original
        // O custo de cada atividade é congelado no momento de seu registro. A nova tarifa será
        // aplicada apenas a futuros registros.

        saveStateToStorage();
        
        alert("Configurações salvas com sucesso!");
        navigateTo('screen-dashboard');
        renderDashboard();
    });

    // --- CONTROLE DE SEMANAS (ACOMPANHAMENTO MENSAL) ---
    // Clique nos cartões de semana
    const weekCards = document.querySelectorAll('.week-card');
    weekCards.forEach(card => {
        card.addEventListener('click', () => {
            const w = parseInt(card.getAttribute('data-week'));
            openWeekDetailsModal(w);
        });
    });

    // Seletor de semana ativa
    const weekSelect = document.getElementById('select-current-week');
    if (weekSelect) {
        weekSelect.addEventListener('change', (e) => {
            state.currentWeek = parseInt(e.target.value);
            // Ao mudar a semana de registro, sincroniza a exibição da gota para ela
            state.selectedWeek = state.currentWeek;
            saveStateToStorage();
            renderDashboard();
        });
    }

    // Fechar modal de detalhes da semana
    document.getElementById('btn-close-week-modal').addEventListener('click', () => {
        document.getElementById('modal-week-details').classList.remove('active');
    });
    document.getElementById('btn-close-week-modal-ok').addEventListener('click', () => {
        document.getElementById('modal-week-details').classList.remove('active');
    });

    // Clique no botão de registrar atividade do Simulador Vazio
    const simGoRegisterBtn = document.getElementById('btn-sim-go-register');
    if (simGoRegisterBtn) {
        simGoRegisterBtn.addEventListener('click', () => {
            selectedActivityType = null;
            document.querySelectorAll('.activity-option').forEach(opt => opt.classList.remove('active'));
            document.getElementById('activity-preview-panel').classList.add('hidden');
            navigateTo('screen-registro-semanal');
        });
    }

    // --- MODAL CONFIRMAR NOVO MÊS ---
    const modalConfirmNewMonth = document.getElementById('modal-confirm-new-month');
    
    const btnConfirmNewMonthOk = document.getElementById('btn-confirm-new-month-ok');
    if (btnConfirmNewMonthOk) {
        btnConfirmNewMonthOk.addEventListener('click', () => {
            if (modalConfirmNewMonth) {
                modalConfirmNewMonth.classList.remove('active');
            }
            iniciarNovoMes();
        });
    }

    const btnConfirmNewMonthCancel = document.getElementById('btn-confirm-new-month-cancel');
    if (btnConfirmNewMonthCancel) {
        btnConfirmNewMonthCancel.addEventListener('click', () => {
            if (modalConfirmNewMonth) {
                modalConfirmNewMonth.classList.remove('active');
            }
        });
    }

    const btnCloseConfirmModal = document.getElementById('btn-close-confirm-modal');
    if (btnCloseConfirmModal) {
        btnCloseConfirmModal.addEventListener('click', () => {
            if (modalConfirmNewMonth) {
                modalConfirmNewMonth.classList.remove('active');
            }
        });
    }
}

// --- Funções Auxiliares de Componentes UI ---
function setupToggleGroup(groupId) {
    const container = document.getElementById(groupId);
    if (!container) return;
    
    const buttons = container.querySelectorAll('.toggle-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function getActiveToggleValue(groupId) {
    const container = document.getElementById(groupId);
    if (!container) return null;
    const activeBtn = container.querySelector('.toggle-btn.active');
    return activeBtn ? activeBtn.getAttribute('data-val') : null;
}

function setToggleActiveValue(groupId, val) {
    const container = document.getElementById(groupId);
    if (!container) return;
    const buttons = container.querySelectorAll('.toggle-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-val') === val) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// --- Controle dos slides do Onboarding ---
function updateOnboardingSlide() {
    const slides = document.querySelectorAll('.onboarding-slide');
    const dots = document.querySelectorAll('.onboarding-indicators .dot');
    const nextBtn = document.getElementById('btn-onboarding-next');
    
    slides.forEach((slide, idx) => {
        if (idx === state.currentOnboardingSlide) {
            slide.classList.add('active');
        } else {
            slide.classList.remove('active');
        }
    });
    
    dots.forEach((dot, idx) => {
        if (idx === state.currentOnboardingSlide) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    
    if (state.currentOnboardingSlide === slides.length - 1) {
        nextBtn.innerHTML = 'Começar agora <i class="fa-solid fa-circle-check"></i>';
    } else {
        nextBtn.innerHTML = 'Próximo <i class="fa-solid fa-arrow-right"></i>';
    }
}

function getCurrentDate() {
    const d = new Date();
    if (state.monthOffset) {
        d.setMonth(d.getMonth() + state.monthOffset);
    }
    return d;
}

// --- Cálculos e Estimativas do Lar ---
function calculateLarMetrics() {
    // [FIX-2] Consumo base: usar número real de dias do mês
    // Obter o número real de dias do mês atual para maior precisão
    const dataAtual = getCurrentDate();
    const diasNoMes = new Date(
        dataAtual.getFullYear(),
        dataAtual.getMonth() + 1,
        0
    ).getDate();

    // Consumo base mensal: 120 litros/pessoa/dia × dias reais do mês
    const baselineMensal = state.residents * 120 * diasNoMes;
    // [FIX-3] Tarifa: usar a função calcularCustoAgua
    const valorEstimadoBase = calcularCustoAgua(baselineMensal);
    
    return {
        consumoMensalBaseLitros: baselineMensal,
        valorEstimadoBase: valorEstimadoBase,
        consumoDiarioPessoa: 120,
        diasNoMes: diasNoMes // expor para uso no dashboard se necessário
    };
}

// --- Verificar se todas as semanas possuem registros ---
function isAllWeeksCompleted() {
    for (let w = 1; w <= 4; w++) {
        const weekLiters = state.weeklyActivities
            .filter(act => act.week === w)
            .reduce((sum, act) => sum + act.liters, 0);
        if (weekLiters === 0) {
            return false;
        }
    }
    return true;
}

// --- Obter Status de uma Semana Específica ---
function getWeekStatus(w, weekLiters) {
    const meta = 500; // meta de atividades adicionais
    
    if (w > state.currentWeek) {
        return {
            cls: 'status-gray',
            text: 'Semana ainda não iniciada'
        };
    }
    
    if (w === state.currentWeek) {
        if (weekLiters > meta) {
            return { cls: 'status-red', text: '<i class="fa-solid fa-circle-xmark" style="margin-right: 0.3rem;"></i> Meta ultrapassada' };
        } else if (weekLiters > meta * 0.8) {
            return { cls: 'status-yellow', text: '<i class="fa-solid fa-circle-exclamation" style="margin-right: 0.3rem;"></i> Próxima da meta' };
        } else {
            return { cls: 'status-blue', text: 'Semana atual' };
        }
    }
    
    // w < state.currentWeek
    if (weekLiters === 0) {
        return { cls: 'status-gray', text: 'Nenhuma atividade registrada' };
    } else if (weekLiters > meta) {
        return { cls: 'status-red', text: '<i class="fa-solid fa-circle-xmark" style="margin-right: 0.3rem;"></i> Meta ultrapassada' };
    } else if (weekLiters > meta * 0.8) {
        return { cls: 'status-yellow', text: '<i class="fa-solid fa-circle-exclamation" style="margin-right: 0.3rem;"></i> Próxima da meta' };
    } else {
        return { cls: 'status-green', text: '<i class="fa-solid fa-circle-check" style="margin-right: 0.3rem;"></i> Dentro da meta' };
    }
}

// --- Renderização do Dashboard ---
function renderDashboard() {
    const metrics = calculateLarMetrics();
    
    // Atualizar Tags de perfil no header (IHC: Feedback de Status Claro)
    let larTexto = 'Lar';
    if (state.residenceType) {
        if (state.residenceType.startsWith('casa')) {
            if (state.residenceType.includes('pequena')) larTexto = 'Casa Pequena';
            else if (state.residenceType.includes('media')) larTexto = 'Casa Média';
            else if (state.residenceType.includes('grande')) larTexto = 'Casa Grande';
            else larTexto = 'Casa';
        } else if (state.residenceType.startsWith('apartamento')) {
            if (state.residenceType.includes('pequena')) larTexto = 'Apê Pequeno';
            else if (state.residenceType.includes('media')) larTexto = 'Apê Médio';
            else if (state.residenceType.includes('grande')) larTexto = 'Apê Grande';
            else larTexto = 'Apartamento';
        }
    }
    const jardimTexto = state.hasGarden ? ' c/ Jardim' : '';
    document.getElementById('dash-residence-summary').textContent = `${larTexto}${jardimTexto}, ${state.residents} morador${state.residents > 1 ? 'es' : ''}`;
    
    // 1. Consumo Base (Mensal)
    const consumoBaseMensal = metrics.consumoMensalBaseLitros;
    
    // 2. Consumo Adicional (Atividades registradas na semana selecionada)
    const consumoAdicionalSemanal = state.weeklyActivities
        .filter(act => act.week === state.selectedWeek)
        .reduce((sum, act) => sum + act.liters, 0);
        
    // 3. Consumo Adicional (Atividades acumuladas no mês inteiro)
    const consumoAdicionalMensal = state.weeklyActivities.reduce((sum, act) => sum + act.liters, 0);
    
    // 4. Consumo Total Estimado (Base + Adicional total)
    const consumoTotalEstimado = consumoBaseMensal + consumoAdicionalMensal;
    // [FIX-3] Tarifa: usar a função calcularCustoAgua
    const valorEstimadoConta = calcularCustoAgua(consumoTotalEstimado);
    
    // Meta de Atividades Extras Semanal (500L) e Mensal (2000L)
    const metaSemanalAtividades = 500;
    const metaMensalAtividades = 2000;
    
    let percentualGota = 0;
    const subtitleEl = document.querySelector('.droplet-text-overlay .droplet-sub');
    
    if (state.cycleState !== 'EM_ANDAMENTO') {
        // Gota representa o desempenho do mês inteiro
        if (metaMensalAtividades > 0) {
            percentualGota = Math.round((consumoAdicionalMensal / metaMensalAtividades) * 100);
        }
        document.getElementById('dash-droplet-percentage').textContent = `${percentualGota}%`;
        document.getElementById('dash-droplet-liters').textContent = `${consumoAdicionalMensal}L / ${metaMensalAtividades}L`;
        if (subtitleEl) {
            // [FIX-7] Gota: legenda redefinida explicando que representa apenas consumo adicional
            subtitleEl.textContent = `de atividades extras no mês (meta: 2.000 L)`;
        }
    } else {
        // Gota representa a semana ativa selecionada
        if (metaSemanalAtividades > 0) {
            percentualGota = Math.round((consumoAdicionalSemanal / metaSemanalAtividades) * 100);
        }
        document.getElementById('dash-droplet-percentage').textContent = `${percentualGota}%`;
        document.getElementById('dash-droplet-liters').textContent = `${consumoAdicionalSemanal}L / ${metaSemanalAtividades}L`;
        if (subtitleEl) {
            // [FIX-7] Gota: legenda redefinida explicando que representa apenas consumo adicional
            subtitleEl.textContent = `Extras da Semana ${state.selectedWeek} (meta: 500 L)`;
        }
    }
    
    // Animar nível da gota (y vai de 115 a 15)
    const waterLevelEl = document.getElementById('droplet-water-level');
    const clippedPercent = Math.min(percentualGota, 100);
    const newY = 115 - (clippedPercent / 100) * 100;
    waterLevelEl.setAttribute('y', newY.toString());
    
    // Atualizar Rótulos da Fórmula Visual (Mostrando totais mensais)
    document.getElementById('dash-formula-base').textContent = `${consumoBaseMensal.toLocaleString('pt-BR')} L`;
    document.getElementById('dash-formula-adicional').textContent = `${consumoAdicionalMensal.toLocaleString('pt-BR')} L`;
    document.getElementById('dash-formula-total').textContent = `${consumoTotalEstimado.toLocaleString('pt-BR')} L`;
    
    // Atualizar os Cards de Métricas Individuais (Atividades adicionais do mês inteiro)
    document.getElementById('dash-consumo-base-card').textContent = `${consumoBaseMensal.toLocaleString('pt-BR')} L`;
    document.getElementById('dash-consumo-adicional-card').textContent = `${consumoAdicionalMensal.toLocaleString('pt-BR')} L`;
    // [FIX-7] Gota/Card: adicionar nota explicativa de "Base + extras registradas" no consumo total
    document.getElementById('dash-consumo-total-card').innerHTML = `${consumoTotalEstimado.toLocaleString('pt-BR')} L <span style="display:block; font-size:0.65rem; font-weight:400; color:var(--text-muted); margin-top:0.15rem;">Base + extras registradas</span>`;
    document.getElementById('dash-valor-estimado-card').textContent = `R$ ${valorEstimadoConta.toFixed(2).replace('.', ',')}`;
    // Consumo médio por pessoa (diário direto do parâmetro de referência)
    document.getElementById('dash-consumo-pessoa-card').textContent = `${metrics.consumoDiarioPessoa} L/pessoa/dia`;

    // Atualizar Card de Status da Meta
    const statusMetaValEl = document.getElementById('dash-status-meta-value');
    const statusMetaDescEl = document.getElementById('dash-status-meta-desc');
    if (statusMetaValEl && statusMetaDescEl) {
        statusMetaValEl.className = 'metric-value'; // Reset classes
        if (consumoAdicionalMensal <= metaMensalAtividades) {
            statusMetaValEl.innerHTML = '<i class="fa-solid fa-circle-check" style="margin-right: 0.35rem;"></i> Dentro da Meta';
            statusMetaValEl.classList.add('text-success');
            statusMetaDescEl.textContent = `Seu consumo adicional mensal (${consumoAdicionalMensal.toLocaleString('pt-BR')} L) está dentro da meta de ${metaMensalAtividades.toLocaleString('pt-BR')} L.`;
        } else {
            statusMetaValEl.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="margin-right: 0.35rem;"></i> Meta Ultrapassada';
            statusMetaValEl.classList.add('text-warning');
            statusMetaDescEl.textContent = `Atenção! Seu consumo adicional mensal (${consumoAdicionalMensal.toLocaleString('pt-BR')} L) ultrapassou a meta de ${metaMensalAtividades.toLocaleString('pt-BR')} L em ${(consumoAdicionalMensal - metaMensalAtividades).toLocaleString('pt-BR')} L.`;
        }
    }
    
    // Configurar o banner de Feedback Inteligente
    const feedbackCard = document.getElementById('dash-feedback-card');
    const feedbackIcon = feedbackCard.querySelector('.feedback-icon-box');
    const feedbackTitle = document.getElementById('dash-feedback-title');
    const feedbackDesc = document.getElementById('dash-feedback-desc');
    
    feedbackCard.className = 'card feedback-card'; // reset classes
    feedbackIcon.className = 'feedback-icon-box';
    
    if (state.cycleState !== 'EM_ANDAMENTO') {
        // Feedback do mês
        if (consumoAdicionalMensal <= metaMensalAtividades) {
            feedbackCard.classList.add('positive');
            feedbackIcon.classList.add('positive');
            feedbackIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            feedbackTitle.textContent = 'Mês Finalizado';
            feedbackDesc.textContent = `Seu consumo de atividades adicionais (${consumoAdicionalMensal}L) ficou dentro da meta mensal de ${metaMensalAtividades}L.`;
        } else {
            feedbackCard.classList.add('negative');
            feedbackIcon.classList.add('negative');
            feedbackIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
            feedbackTitle.textContent = 'Meta Mensal Ultrapassada';
            feedbackDesc.textContent = `Você ultrapassou a meta mensal de atividades adicionais em ${Math.round(consumoAdicionalMensal - metaMensalAtividades)} Litros.`;
        }
    } else {
        // Contar atividades da semana selecionada
        const weeklyActivitiesCount = state.weeklyActivities.filter(act => act.week === state.selectedWeek).length;
        
        if (weeklyActivitiesCount === 0) {
            feedbackIcon.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            feedbackIcon.style.color = 'var(--text-muted)';
            feedbackIcon.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
            feedbackTitle.textContent = `Nenhum registro na Semana ${state.selectedWeek}`;
            feedbackDesc.textContent = `Registre atividades do dia a dia para acompanhar o consumo extra correspondente à Semana ${state.selectedWeek}.`;
        } else {
            if (consumoAdicionalSemanal <= metaSemanalAtividades) {
                feedbackCard.classList.add('positive');
                feedbackIcon.classList.add('positive');
                feedbackIcon.innerHTML = '<i class="fa-solid fa-leaf"></i>';
                feedbackTitle.textContent = 'Dentro da Meta';
                feedbackDesc.textContent = `Seu consumo de atividades extras (${consumoAdicionalSemanal}L) na Semana ${state.selectedWeek} está dentro da meta de ${metaSemanalAtividades}L.`;
            } else {
                feedbackCard.classList.add('negative');
                feedbackIcon.classList.add('negative');
                feedbackIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
                feedbackTitle.textContent = 'Meta Ultrapassada';
                const litrosExcedidos = consumoAdicionalSemanal - metaSemanalAtividades;
                feedbackDesc.textContent = `Atenção! Você ultrapassou a meta de atividades extras da Semana ${state.selectedWeek} em ${Math.round(litrosExcedidos)} Litros.`;
            }
        }
    }
    
    // --- RENDERIZAR ACOMPANHAMENTO MENSAL ---
    const dataAtual = getCurrentDate();
    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const mesNome = meses[dataAtual.getMonth()];
    const ano = dataAtual.getFullYear();
    const currentPeriod = `${mesNome} de ${ano}`;
    
    // Verificar se já possui conta cadastrada para este mês concluído
    const completedMonthRecord = state.monthlyHistory.find(h => h.period === currentPeriod);
    
    const trackingLabelEl = document.getElementById('tracking-timeline-label');
    const weekSelectorEl = document.querySelector('.current-week-selector');
    const finalizeActionBox = document.getElementById('finalize-action-box');
    const proximoPassoEl = document.getElementById('dash-proximo-passo');
    const fabButton = document.getElementById('fab-add-atividade');
    const compTexto = document.getElementById('dash-comparativo-texto');
    const compDetalhado = document.getElementById('dash-comparativo-detalhado');
    const compCard = document.getElementById('dash-comparativo-card');
    
    const dropletWrapper = document.querySelector('.droplet-interactive-wrapper');
    const weeksContainer = document.querySelector('.weeks-container');
    
    if (state.cycleState === 'COMPARACAO_DISPONIVEL') {
        // Acompanhamento Finalizado - Comparação Disponível
        if (trackingLabelEl) {
            trackingLabelEl.innerHTML = `<i class="fa-solid fa-circle-check text-success" style="margin-right: 0.3rem;"></i> Mês Concluído (${mesNome} de ${ano})`;
        }
        
        // Exibir e Ocultar Componentes
        if (dropletWrapper) dropletWrapper.classList.add('hidden');
        if (feedbackCard) feedbackCard.classList.add('hidden');
        if (weekSelectorEl) weekSelectorEl.style.display = 'none';
        if (weeksContainer) weeksContainer.classList.add('hidden');
        if (finalizeActionBox) finalizeActionBox.classList.add('hidden');
        if (proximoPassoEl) proximoPassoEl.classList.add('hidden');
        if (fabButton) fabButton.classList.add('hidden');
        if (compCard) compCard.classList.remove('hidden');
        
        // Renderizar Relatório Comparativo Detalhado
        renderComparativoRealEstimado(consumoTotalEstimado, valorEstimadoConta);
        
    } else if (state.cycleState === 'AGUARDANDO_CONTA_REAL') {
        // Acompanhamento Finalizado - Aguardando Conta Real
        if (trackingLabelEl) {
            trackingLabelEl.innerHTML = `<i class="fa-solid fa-circle-check text-success" style="margin-right: 0.3rem;"></i> Mês Concluído (${mesNome} de ${ano})`;
        }
        
        // Exibir e Ocultar Componentes
        if (dropletWrapper) dropletWrapper.classList.add('hidden');
        if (feedbackCard) feedbackCard.classList.add('hidden');
        if (weekSelectorEl) weekSelectorEl.style.display = 'none';
        if (weeksContainer) weeksContainer.classList.add('hidden');
        if (finalizeActionBox) finalizeActionBox.classList.add('hidden');
        if (proximoPassoEl) proximoPassoEl.classList.remove('hidden');
        if (fabButton) fabButton.classList.add('hidden');
        if (compCard) compCard.classList.add('hidden');
        
    } else {
        // EM_ANDAMENTO
        if (trackingLabelEl) {
            trackingLabelEl.textContent = `${mesNome} ${ano} — Semana Atual: ${state.currentWeek}/4`;
        }
        
        // Exibir e Ocultar Componentes
        if (dropletWrapper) dropletWrapper.classList.remove('hidden');
        if (feedbackCard) feedbackCard.classList.remove('hidden');
        if (weekSelectorEl) weekSelectorEl.style.display = 'block';
        if (weeksContainer) weeksContainer.classList.remove('hidden');
        if (proximoPassoEl) proximoPassoEl.classList.add('hidden');
        if (fabButton) fabButton.classList.remove('hidden');
        if (compCard) compCard.classList.add('hidden');
        
        // Exibir ou ocultar botão de finalizar
        if (isAllWeeksCompleted()) {
            if (finalizeActionBox) finalizeActionBox.classList.remove('hidden');
        } else {
            if (finalizeActionBox) finalizeActionBox.classList.add('hidden');
        }
    }
    
    // Atualizar cartões semanais
    const weekSelect = document.getElementById('select-current-week');
    if (weekSelect) {
        weekSelect.value = state.currentWeek;
    }
    for (let w = 1; w <= 4; w++) {
        const weekLiters = state.weeklyActivities
            .filter(act => act.week === w)
            .reduce((sum, act) => sum + act.liters, 0);
            
        const cardEl = document.querySelector(`.week-card[data-week="${w}"]`);
        if (cardEl) {
            const statusObj = getWeekStatus(w, weekLiters);
            
            cardEl.className = `week-card ${statusObj.cls}`;
            if (w === state.currentWeek && state.cycleState === 'EM_ANDAMENTO') {
                cardEl.classList.add('active-week');
            }
            
            document.getElementById(`week-${w}-liters`).textContent = `${weekLiters} L registrados`;
            document.getElementById(`week-${w}-status`).innerHTML = statusObj.text;
        }
    }
}

// --- Detalhes da Semana no Modal ---
function openWeekDetailsModal(w) {
    state.selectedWeek = w; // Atualiza a semana selecionada
    saveStateToStorage();
    renderDashboard(); // Atualiza a gota e os cards no dashboard para a semana clicada
    
    // Obter as atividades da semana
    const weekActs = state.weeklyActivities.filter(act => act.week === w);
    
    // Atualizar título do modal
    document.getElementById('modal-week-title').innerHTML = `<i class="fa-solid fa-calendar-week"></i> Semana ${w}`;
    
    // Consolidar atividades por tipo para exibir quantidades (ex: "Lavar roupa — 2 vezes — 240 L")
    const consolidated = {};
    weekActs.forEach(act => {
        if (!consolidated[act.type]) {
            consolidated[act.type] = {
                name: act.name,
                count: 0,
                liters: 0
            };
        }
        consolidated[act.type].count++;
        consolidated[act.type].liters += act.liters;
    });
    
    const listEl = document.getElementById('modal-week-activities-list');
    listEl.innerHTML = '';
    
    const consolidatedArray = Object.values(consolidated);
    if (consolidatedArray.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1.5rem 0;">
                Nenhuma atividade registrada nesta semana.
            </div>
        `;
    } else {
        consolidatedArray.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'week-activity-item';
            itemEl.innerHTML = `
                <div class="week-activity-name-qty">
                    <span class="activity-name-text">${item.name}</span>
                    <span class="activity-qty-text">${item.count} vez${item.count > 1 ? 'es' : ''}</span>
                </div>
                <span class="activity-liters-text">${item.liters} L</span>
            `;
            listEl.appendChild(itemEl);
        });
    }
    
    // Calcular totais
    const totalLiters = weekActs.reduce((sum, act) => sum + act.liters, 0);
    const meta = 500;
    
    document.getElementById('modal-week-total-liters').textContent = `${totalLiters} Litros`;
    document.getElementById('modal-week-meta-liters').textContent = `${meta} Litros`;
    
    const statusBadge = document.getElementById('modal-week-meta-status');
    statusBadge.className = 'status-badge';
    
    if (totalLiters === 0) {
        statusBadge.textContent = 'Sem registros';
        statusBadge.className = 'status-badge cinza';
    } else if (totalLiters > meta) {
        statusBadge.textContent = 'Meta ultrapassada';
        statusBadge.className = 'status-badge vermelho';
    } else if (totalLiters > meta * 0.8) {
        statusBadge.textContent = 'Próxima da meta';
        statusBadge.className = 'status-badge amarelo';
    } else {
        statusBadge.textContent = 'Meta respeitada';
        statusBadge.className = 'status-badge verde';
    }
    
    // Abrir o modal
    const weekModal = document.getElementById('modal-week-details');
    weekModal.classList.add('active');
}

// --- Funções de Ciclo Mensal ---
function finalizarMes() {
    state.isMonthFinished = true;
    state.cycleState = 'AGUARDANDO_CONTA_REAL';
    state.selectedWeek = 4;
    saveStateToStorage();
    renderDashboard();
}

function iniciarNovoMes() {
    // Incrementar offset do mês
    state.monthOffset = (state.monthOffset || 0) + 1;
    
    // Resetar atividades semanais e semanas
    state.weeklyActivities = [];
    state.currentWeek = 1;
    state.selectedWeek = 1;
    state.isMonthFinished = false;
    state.cycleState = 'EM_ANDAMENTO';
    saveStateToStorage();
    
    // Atualizar dashboard e ir para tela inicial
    renderDashboard();
    navigateTo('screen-dashboard');
}

// --- Comparativo de Conta Real no Dashboard ---
function renderComparativoRealEstimado(consumoTotalEstimado, valorEstimadoConta) {
    const compTexto = document.getElementById('dash-comparativo-texto');
    const compDetalhado = document.getElementById('dash-comparativo-detalhado');
    
    if (!compTexto || !compDetalhado) return;
    
    // Obter data atual para localizar o mês correspondente
    const dataAtual = new Date();
    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const mesNome = meses[dataAtual.getMonth()];
    const ano = dataAtual.getFullYear();
    const currentPeriod = `${mesNome} de ${ano}`;
    
    const completedMonthRecord = state.monthlyHistory.find(h => h.period === currentPeriod);
    
    if (state.cycleState === 'COMPARACAO_DISPONIVEL' && completedMonthRecord) {
        // Mês concluído e conta real inserida: Renderizar relatório detalhado
        compTexto.classList.add('hidden');
        compDetalhado.classList.remove('hidden');
        
        const consumoRealLitros = completedMonthRecord.consumoReal;
        const valorPago = completedMonthRecord.valorReal;
        
        const difLitros = completedMonthRecord.diferencaLitros;
        const difReais = completedMonthRecord.diferencaReais;
        
        const economizou = difLitros < 0;
        const statusText = economizou 
            ? '<i class="fa-solid fa-leaf" style="margin-right: 0.3rem;"></i> Economia Identificada' 
            : '<i class="fa-solid fa-circle-exclamation" style="margin-right: 0.3rem;"></i> Excesso Detectado';
        const statusClass = economizou ? "text-success" : "text-warning";
        
        const precision = completedMonthRecord.consumoReal > 0 
            ? Math.round(Math.max(0, 100 - (Math.abs(completedMonthRecord.consumoReal - completedMonthRecord.consumoTotal) / completedMonthRecord.consumoReal) * 100))
            : 0;
            
        compDetalhado.innerHTML = `
            <div class="comp-report-grid">
                <div class="comp-report-col">
                    <span class="comp-label">Consumo Estimado:</span>
                    <span class="comp-val">${completedMonthRecord.consumoTotal.toLocaleString('pt-BR')} L</span>
                </div>
                <div class="comp-report-col">
                    <span class="comp-label">Consumo Real (Fatura):</span>
                    <span class="comp-val">${consumoRealLitros.toLocaleString('pt-BR')} L</span>
                </div>
                <div class="comp-report-col">
                    <span class="comp-label">Diferença em Volume:</span>
                    <span class="comp-val ${statusClass}">${economizou ? '-' : '+'}${Math.abs(difLitros).toLocaleString('pt-BR')} L</span>
                </div>
                <div class="comp-report-col">
                    <span class="comp-label">Diferença em Conta:</span>
                    <span class="comp-val ${statusClass}">${economizou ? '-' : '+'}R$ ${Math.abs(difReais).toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="comp-report-col font-bold">
                    <span class="comp-label">Precisão da Estimativa:</span>
                    <span class="comp-val text-accent">${precision}%</span>
                </div>
                <div class="comp-report-col font-bold">
                    <span class="comp-label">Situação do Período:</span>
                    <span class="comp-val ${statusClass}">${statusText}</span>
                </div>
            </div>
            
            <div class="comp-projection-box">
                <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-light);"><i class="fa-solid fa-chart-line text-accent"></i> Projeção Anual (Base Real)</h4>
                <div class="comp-report-grid" style="margin-top: 0.25rem;">
                    <div class="comp-report-col">
                        <span class="comp-label">Consumo Anual Previsto:</span>
                        <span class="comp-val">${(consumoRealLitros * 12).toLocaleString('pt-BR')} L</span>
                    </div>
                    <div class="comp-report-col">
                        <span class="comp-label font-bold">Custo Anual Previsto (estimativa*):</span>
                        <span class="comp-val text-success">R$ ${(valorPago * 12).toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                    * Estimativa baseada no consumo de um único mês. Pode variar conforme a sazonalidade (verão/inverno).
                </p>
            </div>
            
            <div class="new-cycle-container">
                <button type="button" class="btn btn-primary btn-large btn-block btn-highlight-pulse" id="btn-iniciar-novo-mes" style="box-shadow: 0 4px 15px rgba(0, 242, 254, 0.4);">
                    <i class="fa-solid fa-rotate"></i> Iniciar Novo Ciclo Mensal
                </button>
            </div>
        `;
        
        // Adicionar event listener para o novo botão do ciclo
        const btnNewCycle = document.getElementById('btn-iniciar-novo-mes');
        if (btnNewCycle) {
            btnNewCycle.addEventListener('click', () => {
                const modal = document.getElementById('modal-confirm-new-month');
                if (modal) {
                    modal.classList.add('active');
                }
            });
        }
        return;
    }
    
    // Comportamento normal/em andamento
    compDetalhado.classList.add('hidden');
    compTexto.classList.remove('hidden');
    
    if (state.registeredBills.length === 0) {
        compTexto.textContent = 'Ainda não há dados suficientes para comparação.';
        return;
    }
    
    // Pegar a última conta cadastrada
    const ultimaConta = state.registeredBills[state.registeredBills.length - 1];
    
    const consumoRealLitros = ultimaConta.consumoReal * 1000;
    const diferencaLitros = consumoRealLitros - consumoTotalEstimado;
    const diferencaDinheiro = ultimaConta.valorPago - valorEstimadoConta;
    
    let subTexto = '';
    let corDiferenca = '';
    
    if (diferencaLitros < 0) {
        const economiaLitros = Math.abs(diferencaLitros);
        const economiaDinheiro = Math.abs(diferencaDinheiro);
        corDiferenca = 'text-success';
        subTexto = `<span class="${corDiferenca}">Economizou ${economiaLitros.toLocaleString('pt-BR')}L</span> (R$ ${economiaDinheiro.toFixed(2).replace('.', ',')}) comparado ao consumo estimado total em ${ultimaConta.mes}. Projeção anual de economia: R$ ${(economiaDinheiro * 12).toFixed(2).replace('.', ',')}`;
    } else {
        const desperdicioLitros = Math.abs(diferencaLitros);
        const desperdicioDinheiro = Math.abs(diferencaDinheiro);
        corDiferenca = 'text-warning';
        subTexto = `<span class="${corDiferenca}">Excedeu ${desperdicioLitros.toLocaleString('pt-BR')}L</span> (+R$ ${desperdicioDinheiro.toFixed(2).replace('.', ',')}) comparado ao consumo estimado total em ${ultimaConta.mes}. Projeção anual de gasto extra: R$ ${(desperdicioDinheiro * 12).toFixed(2).replace('.', ',')}`;
    }
    
    compTexto.innerHTML = `Na conta de <strong>${ultimaConta.mes}</strong>, você registrou ${consumoRealLitros.toLocaleString('pt-BR')}L pagos com R$ ${ultimaConta.valorPago.toFixed(2).replace('.', ',')}. <br>${subTexto}`;
}

// --- Registro Semanal - Preview de Impacto ---
function updateActivityPreview(actType) {
    const previewPanel = document.getElementById('activity-preview-panel');
    if (!actType) {
        previewPanel.classList.add('hidden');
        return;
    }
    
    previewPanel.classList.remove('hidden');
    
    // TODO: atualizar HTML correspondente (opção piscina foi dividida em piscina_reposicao e piscina_encher no HTML)
    let key = actType;
    if (key === 'piscina') {
        key = 'piscina_reposicao';
    }
    const actData = CONSUMO_REFERENCIA.activities[key];
    const liters = actData.liters;
    // [FIX-3] Tarifa: usar a função calcularCustoAgua
    const cost = calcularCustoAgua(liters);
    
    document.getElementById('preview-litros').textContent = `+${liters} Litros`;
    document.getElementById('preview-custo').textContent = `+R$ ${cost.toFixed(2).replace('.', ',')}`;
}

// --- Simulador de Economia - Cálculos reativos ---
function initSimulator() {
    // Configurar visibilidade de rega de jardim com base no cadastro
    const gardenCard = document.getElementById('sim-card-jardim');
    if (gardenCard) {
        gardenCard.style.display = state.hasGarden ? 'block' : 'none';
    }
    
    // Obter quantidade real de registros do mês atual (todas as atividades acumuladas)
    const monthActs = state.weeklyActivities;
    
    const emptyStateEl = document.getElementById('sim-empty-state');
    const slidersListEl = document.querySelector('.sliders-list');
    
    const activitiesList = [
        { key: 'banho', maxLimit: 50, unit: 'mês' },
        { key: 'roupa', maxLimit: 30, unit: 'mês' },
        { key: 'carro', maxLimit: 15, unit: 'mês' },
        { key: 'jardim', maxLimit: 30, unit: 'mês', conditional: true, condVal: state.hasGarden },
        { key: 'calcada', maxLimit: 30, unit: 'mês' },
        // [FIX-1] Piscina: separar "Encher do Zero" e "Reposição Semanal"
        { key: 'piscina_reposicao', maxLimit: 15, unit: 'mês' },
        { key: 'piscina_encher', maxLimit: 5, unit: 'mês' }
    ];
    
    // Ocultar sempre o estado vazio por solicitação do usuário (IHC: Simulador sempre ativo)
    if (emptyStateEl) emptyStateEl.classList.add('hidden');
    if (slidersListEl) slidersListEl.classList.remove('hidden');
    
    activitiesList.forEach(act => {
        // [FIX-1] Piscina: mapear keys para o elemento HTML existente se necessário
        let elKey = act.key;
        if (elKey === 'piscina_reposicao') {
            elKey = 'piscina';
        } else if (elKey === 'piscina_encher') {
            // TODO: criar slider separado para piscina_encher (não há elemento HTML correspondente)
            return;
        }
        
        const count = monthActs.filter(a => a.type === act.key).length;
        const sliderEl = document.getElementById(`slider-sim-${elKey}`);
        if (sliderEl) {
            sliderEl.disabled = false;
            sliderEl.max = Math.max(act.maxLimit, count * 2);
            sliderEl.value = count;
        }
        
        const badgeEl = document.getElementById(`badge-sim-${elKey}`);
        if (badgeEl) badgeEl.textContent = `${count}x`;
        
        const compAtualEl = document.getElementById(`comp-sim-${elKey}-atual`);
        if (compAtualEl) compAtualEl.textContent = `${count}x/${act.unit}`;
        
        const compNovoEl = document.getElementById(`comp-sim-${elKey}-novo`);
        if (compNovoEl) compNovoEl.textContent = `${count}x/${act.unit}`;
    });
    
    updateSimulatorCalculations();
}

function updateSimulatorCalculations() {
    const metrics = calculateLarMetrics();
    
    // Obter quantidade real de registros do mês atual (todas as atividades acumuladas)
    const monthActs = state.weeklyActivities;
    
    const activitiesList = [
        { key: 'banho', maxLimit: 50, unit: 'mês', liters: 180 },
        { key: 'roupa', maxLimit: 30, unit: 'mês', liters: 120 },
        { key: 'carro', maxLimit: 15, unit: 'mês', liters: 220 },
        { key: 'jardim', maxLimit: 30, unit: 'mês', liters: 150, conditional: true, condVal: state.hasGarden },
        // [FIX-4] Calçada: corrigir valor subestimado de 100 L para 180 L
        { key: 'calcada', maxLimit: 30, unit: 'mês', liters: 180 },
        // [FIX-1] Piscina: separar "Encher do Zero" e "Reposição Semanal"
        { key: 'piscina_reposicao', maxLimit: 15, unit: 'mês', liters: 1000 },
        { key: 'piscina_encher', maxLimit: 5, unit: 'mês', liters: 36000 }
    ];
    
    let totalAguaSalvaMensal = 0;
    let alterouQualquer = false;
    
    activitiesList.forEach(act => {
        if (act.conditional && !act.condVal) {
            return;
        }
        
        // [FIX-1] Piscina: mapear keys para o elemento HTML existente se necessário
        let elKey = act.key;
        if (elKey === 'piscina_reposicao') {
            elKey = 'piscina';
        } else if (elKey === 'piscina_encher') {
            // TODO: criar slider separado para piscina_encher (não há elemento HTML correspondente)
            return;
        }
        
        const countAtual = monthActs.filter(a => a.type === act.key).length;
        const sliderEl = document.getElementById(`slider-sim-${elKey}`);
        if (!sliderEl) return;
        
        const simVal = parseInt(sliderEl.value);
        
        // Atualizar badges do slider
        const badgeEl = document.getElementById(`badge-sim-${elKey}`);
        if (badgeEl) badgeEl.textContent = `${simVal}x`;
        
        const compNovoEl = document.getElementById(`comp-sim-${elKey}-novo`);
        if (compNovoEl) compNovoEl.textContent = `${simVal}x/${act.unit}`;
        
        if (simVal !== countAtual) {
            alterouQualquer = true;
        }
        
        // Calcular economia (remover act.multiplier conforme [FIX-6])
        const dif = countAtual - simVal;
        const salvo = dif * act.liters;
        totalAguaSalvaMensal += salvo;
        
        const compEconEl = document.getElementById(`comp-sim-${elKey}-economia`);
        if (compEconEl) {
            if (dif > 0) {
                compEconEl.textContent = `Economia: ≈ ${salvo.toLocaleString('pt-BR')} L/mês`;
                compEconEl.className = 'comp-economy text-success';
            } else if (dif < 0) {
                compEconEl.textContent = `Aumento: ≈ ${Math.abs(salvo).toLocaleString('pt-BR')} L/mês`;
                compEconEl.className = 'comp-economy text-warning';
            } else {
                compEconEl.textContent = 'Sem alterações';
                compEconEl.className = 'comp-economy';
            }
        }
    });
    
    const economiaLiters = totalAguaSalvaMensal;
    // [FIX-3] Tarifa: usar a função calcularCustoAgua, mantendo o sinal se for negativo (desperdício)
    const economiaFinanceira = (economiaLiters >= 0 ? 1 : -1) * calcularCustoAgua(Math.abs(economiaLiters));
    
    // Consumo Total Atual Estimado
    const consumoAdicionalMensal = state.weeklyActivities.reduce((sum, act) => sum + act.liters, 0);
    const consumoTotalAtual = metrics.consumoMensalBaseLitros + consumoAdicionalMensal;
    // [FIX-3] Tarifa: usar a função calcularCustoAgua
    const custoTotalAtual = calcularCustoAgua(consumoTotalAtual);
    
    // Nova conta estimada (Atual - Economia)
    const novaContaEstimada = Math.max(0, custoTotalAtual - economiaFinanceira);
    
    // Percentual de redução de consumo
    let percentualReducao = 0;
    if (consumoTotalAtual > 0) {
        percentualReducao = Math.round((economiaLiters / consumoTotalAtual) * 100);
    }
    
    // Atualizar Indicadores Principais
    const litFormat = Math.round(economiaLiters).toLocaleString('pt-BR');
    const finFormat = Math.abs(economiaFinanceira).toFixed(2).replace('.', ',');
    
    document.getElementById('sim-economia-litros').textContent = `${economiaLiters < 0 ? '-' : ''}${Math.abs(Math.round(economiaLiters)).toLocaleString('pt-BR')} Litros`;
    document.getElementById('sim-economia-financeira').textContent = `${economiaFinanceira < 0 ? '-' : ''}R$ ${finFormat}`;
    
    const litrosEl = document.getElementById('sim-economia-litros');
    const financeiroEl = document.getElementById('sim-economia-financeira');
    if (economiaLiters > 0) {
        litrosEl.style.color = 'var(--success)';
        financeiroEl.style.color = 'var(--success)';
    } else if (economiaLiters < 0) {
        litrosEl.style.color = 'var(--warning)';
        financeiroEl.style.color = 'var(--warning)';
    } else {
        litrosEl.style.color = 'var(--text-white)';
        financeiroEl.style.color = 'var(--text-white)';
    }
    
    document.getElementById('sim-economia-percentual').textContent = `${percentualReducao}%`;
    document.getElementById('sim-nova-conta').textContent = `R$ ${novaContaEstimada.toFixed(2).replace('.', ',')}`;
    
    // Mensagem de Feedback Contextual
    const feedbackMsgEl = document.getElementById('sim-feedback-msg');
    if (!alterouQualquer) {
        feedbackMsgEl.textContent = "Altere um ou mais hábitos para visualizar sua economia potencial.";
    } else {
        if (economiaLiters < 0) {
            feedbackMsgEl.textContent = "Atenção: A simulação indica um aumento de consumo em relação ao seu comportamento atual.";
        } else {
            feedbackMsgEl.textContent = `Com essas mudanças você poderá economizar aproximadamente ${Math.round(economiaLiters).toLocaleString('pt-BR')} litros de água por mês.`;
        }
    }
    
    // Seção Dica do AquaConsciente
    const tipDescEl = document.getElementById('sim-tip-desc');
    if (alterouQualquer) {
        // Calcular economias separadamente
        const econs = [];
        activitiesList.forEach(act => {
            if (act.conditional && !act.condVal) return;
            const countAtual = monthActs.filter(a => a.type === act.key).length;
            const sliderEl = document.getElementById(`slider-sim-${act.key}`);
            if (!sliderEl) return;
            const simVal = parseInt(sliderEl.value);
            const dif = countAtual - simVal;
            const salvo = dif * act.liters * act.multiplier;
            econs.push({ key: act.key, name: act.key === 'banho' ? 'banhos longos' : (act.key === 'roupa' ? 'lavagem de roupa' : (act.key === 'carro' ? 'lavagem de carro' : (act.key === 'jardim' ? 'rega do jardim' : (act.key === 'calcada' ? 'lavagem de calçada' : 'uso da piscina')))), valor: salvo });
        });
        
        econs.sort((a, b) => b.valor - a.valor);
        
        if (econs[0].valor > 0) {
            tipDescEl.textContent = `Entre todas as alterações simuladas, reduzir o consumo de ${econs[0].name} representa o maior impacto na sua economia.`;
        } else {
            tipDescEl.textContent = "Ajuste os sliders para reduzir seus hábitos e simular uma economia real.";
        }
    } else {
        // Encontrar potencial máximo
        const econs = [];
        activitiesList.forEach(act => {
            if (act.conditional && !act.condVal) return;
            const countAtual = monthActs.filter(a => a.type === act.key).length;
            const pot = countAtual * act.liters * act.multiplier;
            econs.push({ name: act.key === 'banho' ? 'banhos longos' : (act.key === 'roupa' ? 'lavagem de roupa' : (act.key === 'carro' ? 'lavagem de carro' : (act.key === 'jardim' ? 'rega do jardim' : (act.key === 'calcada' ? 'lavagem de calçada' : 'uso da piscina')))), valor: pot });
        });
        
        econs.sort((a, b) => b.valor - a.valor);
        
        if (econs[0].valor === 0) {
            tipDescEl.textContent = "Excelente! Seus hábitos de consumo estão em níveis mínimos neste mês.";
        } else {
            tipDescEl.textContent = `Reduzir o consumo em ${econs[0].name} representa a maior oportunidade de economia de água para este mês.`;
        }
    }
}

// --- Renderização do Histórico (Relatórios) ---
function renderHistory() {
    // Comparação entre meses
    const cardCompMeses = document.getElementById('card-comparacao-meses');
    const compMesesTexto = document.getElementById('comparacao-meses-texto');
    
    if (cardCompMeses && compMesesTexto) {
        if (state.monthlyHistory && state.monthlyHistory.length > 1) {
            const m1 = state.monthlyHistory[state.monthlyHistory.length - 2];
            const m2 = state.monthlyHistory[state.monthlyHistory.length - 1];
            
            const mes1 = m1.period.split(" de ")[0];
            const mes2 = m2.period.split(" de ")[0];
            
            const v1 = m1.consumoReal;
            const v2 = m2.consumoReal;
            const dif = v1 - v2;
            
            cardCompMeses.classList.remove('hidden');
            if (dif > 0) {
                const pct = v1 > 0 ? Math.round((dif / v1) * 100) : 0;
                compMesesTexto.innerHTML = `<strong>${mes1}</strong>: ${v1.toLocaleString('pt-BR')} L | <strong>${mes2}</strong>: ${v2.toLocaleString('pt-BR')} L.<br>Você economizou <strong>${dif.toLocaleString('pt-BR')} litros</strong> (${pct}% de redução).`;
            } else if (dif < 0) {
                const pct = v1 > 0 ? Math.round((Math.abs(dif) / v1) * 100) : 0;
                compMesesTexto.innerHTML = `<strong>${mes1}</strong>: ${v1.toLocaleString('pt-BR')} L | <strong>${mes2}</strong>: ${v2.toLocaleString('pt-BR')} L.<br>Houve um aumento de <strong>${Math.abs(dif).toLocaleString('pt-BR')} litros</strong> (${pct}% de acréscimo).`;
            } else {
                compMesesTexto.innerHTML = `<strong>${mes1}</strong>: ${v1.toLocaleString('pt-BR')} L | <strong>${mes2}</strong>: ${v2.toLocaleString('pt-BR')} L.<br>O consumo permaneceu idêntico.`;
            }
        } else {
            cardCompMeses.classList.add('hidden');
        }
    }

    const container = document.getElementById('container-contas-registradas');
    if (!container) return;
    
    // Se não houver histórico consolidado nem contas simples
    if ((!state.monthlyHistory || state.monthlyHistory.length === 0) && state.registeredBills.length === 0) {
        if (cardCompMeses) cardCompMeses.classList.add('hidden');
        container.innerHTML = `
            <div class="empty-state-card">
                <i class="fa-solid fa-folder-open"></i>
                <p>Nenhuma conta real registrada ainda.</p>
            </div>
        `;
        renderCharts();
        return;
    }
    
    container.innerHTML = '';
    
    if (state.monthlyHistory && state.monthlyHistory.length > 0) {
        // Exibir histórico mensal detalhado (IHD: Legibilidade e Qualificação)
        const historicoOrdenado = [...state.monthlyHistory].reverse();
        
        historicoOrdenado.forEach(month => {
            const card = document.createElement('div');
            card.className = 'history-item-card';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'stretch';
            card.style.gap = '0.75rem';
            card.style.padding = '1.25rem';
            card.style.marginBottom = '1rem';
            
            const difLitros = month.diferencaLitros;
            const difReais = month.diferencaReais;
            const economizou = difLitros < 0;
            const badgeClass = economizou ? 'badge-economizou' : 'badge-excedeu';
            
            const absDifL = Math.abs(Math.round(difLitros));
            const absDifR$ = Math.abs(difReais).toFixed(2).replace('.', ',');
            
            const badgeText = economizou 
                ? `Economizou ${absDifL.toLocaleString('pt-BR')}L` 
                : `Excedeu ${absDifL.toLocaleString('pt-BR')}L`;
                
            const precision = month.consumoReal > 0 
                ? Math.round(Math.max(0, 100 - (Math.abs(month.consumoReal - month.consumoTotal) / month.consumoReal) * 100))
                : 0;
                
            const situacaoMetaClass = month.situacaoMeta === 'Dentro da Meta' ? 'text-success' : 'text-warning';
            
            card.innerHTML = `
                <div class="history-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem; margin-bottom: 0.25rem;">
                    <span class="history-mes" style="font-weight: 700; font-size: 1.05rem; color: var(--text-light);"><i class="fa-solid fa-calendar-check text-accent" style="margin-right: 0.3rem;"></i> ${month.period}</span>
                    <span class="history-badge ${badgeClass}" style="font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: 0.5rem; color: #ffffff !important;">${badgeText}</span>
                </div>
                
                <div class="history-details-grid">
                    <div class="comp-report-col">
                        <span class="comp-label">Consumo Base:</span>
                        <span class="comp-val" style="font-size: 0.85rem;">${month.consumoBase.toLocaleString('pt-BR')} L</span>
                    </div>
                    <div class="comp-report-col">
                        <span class="comp-label">Consumo Adicional:</span>
                        <span class="comp-val" style="font-size: 0.85rem;">${month.consumoAdicional.toLocaleString('pt-BR')} L</span>
                    </div>
                    <div class="comp-report-col">
                        <span class="comp-label">Consumo Estimado:</span>
                        <span class="comp-val text-accent" style="font-size: 0.85rem;">${month.consumoTotal.toLocaleString('pt-BR')} L</span>
                    </div>
                    <div class="comp-report-col">
                        <span class="comp-label">Consumo Real (Fatura):</span>
                        <span class="comp-val" style="font-size: 0.85rem;">${month.consumoReal.toLocaleString('pt-BR')} L</span>
                    </div>
                    <div class="comp-report-col">
                        <span class="comp-label">Valor Estimado:</span>
                        <span class="comp-val text-success" style="font-size: 0.85rem;">R$ ${month.valorEstimado.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div class="comp-report-col">
                        <span class="comp-label">Valor Pago Real:</span>
                        <span class="comp-val text-success" style="font-size: 0.85rem;">R$ ${month.valorReal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div class="comp-report-col col-span-2" style="border-top: 1px solid rgba(255,255,255,0.04); padding-top: 0.4rem; display: flex; flex-direction: row; justify-content: space-between; font-size: 0.8rem; margin-top: 0.25rem;">
                        <span>Precisão: <strong class="text-accent">${precision}%</strong></span>
                        <span>Meta de Adicionais: <strong class="${situacaoMetaClass}">${month.situacaoMeta}</strong></span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    } else {
        // Modo retrocompatibilidade
        const metrics = calculateLarMetrics();
        const contasOrdenadas = [...state.registeredBills].reverse();
        
        contasOrdenadas.forEach(bill => {
            const consumoRealLitros = bill.consumoReal * 1000;
            const consumoAdicionalMensal = state.weeklyActivities.reduce((sum, act) => sum + act.liters, 0);
            const diferencaLitros = consumoRealLitros - (metrics.consumoMensalBaseLitros + consumoAdicionalMensal);
            
            const card = document.createElement('div');
            card.className = 'history-item-card';
            card.style.marginBottom = '1rem';
            
            let badgeHtml = '';
            if (diferencaLitros < 0) {
                badgeHtml = `<span class="history-badge badge-economizou">Economizou ${Math.abs(Math.round(diferencaLitros)).toLocaleString('pt-BR')}L</span>`;
            } else {
                badgeHtml = `<span class="history-badge badge-excedeu">Excedeu ${Math.abs(Math.round(diferencaLitros)).toLocaleString('pt-BR')}L</span>`;
            }
            
            card.innerHTML = `
                <div class="history-info">
                    <span class="history-mes">${bill.mes}</span>
                    <span class="history-litros">${consumoRealLitros.toLocaleString('pt-BR')} Litros (${bill.consumoReal} m³)</span>
                </div>
                <div class="history-finance">
                    <span class="history-valor">R$ ${bill.valorPago.toFixed(2).replace('.', ',')}</span>
                    ${badgeHtml}
                </div>
            `;
            container.appendChild(card);
        });
    }
    
    // Desenhar os cartões resumo e os gráficos comparativos
    renderReportSummary();
    renderCharts();
}

// Desenhar os cartões resumo e os gráficos comparativos
function renderReportSummary() {
    const container = document.getElementById('report-summary-cards');
    if (!container) return;
    
    let previstoLiters = 0;
    let realLiters = 0;
    let previstoCost = 0;
    let realCost = 0;
    
    if (state.monthlyHistory && state.monthlyHistory.length > 0) {
        // Pegar o último mês consolidado
        const lastMonth = state.monthlyHistory[state.monthlyHistory.length - 1];
        previstoLiters = lastMonth.consumoTotal;
        realLiters = lastMonth.consumoReal;
        previstoCost = lastMonth.valorEstimado;
        realCost = lastMonth.valorReal;
    }
    
    container.innerHTML = `
        <div class="card summary-card" style="border-left: 4px solid #2563EB;">
            <span class="card-title-lbl"><i class="fa-solid fa-droplet" style="color: #2563EB; margin-right: 0.35rem;"></i> Consumo Previsto:</span>
            <strong class="card-val-lbl">${previstoLiters > 0 ? previstoLiters.toLocaleString('pt-BR') + ' L' : '--- L'}</strong>
        </div>
        <div class="card summary-card" style="border-left: 4px solid #16A34A;">
            <span class="card-title-lbl"><i class="fa-solid fa-droplet" style="color: #16A34A; margin-right: 0.35rem;"></i> Consumo Real:</span>
            <strong class="card-val-lbl">${realLiters > 0 ? realLiters.toLocaleString('pt-BR') + ' L' : '--- L'}</strong>
        </div>
        <div class="card summary-card" style="border-left: 4px solid #2563EB;">
            <span class="card-title-lbl"><i class="fa-solid fa-hand-holding-dollar" style="color: #2563EB; margin-right: 0.35rem;"></i> Valor Previsto:</span>
            <strong class="card-val-lbl">${previstoCost > 0 ? 'R$ ' + previstoCost.toFixed(2).replace('.', ',') : 'R$ ---'}</strong>
        </div>
        <div class="card summary-card" style="border-left: 4px solid #16A34A;">
            <span class="card-title-lbl"><i class="fa-solid fa-hand-holding-dollar" style="color: #16A34A; margin-right: 0.35rem;"></i> Valor Real:</span>
            <strong class="card-val-lbl">${realCost > 0 ? 'R$ ' + realCost.toFixed(2).replace('.', ',') : 'R$ ---'}</strong>
        </div>
    `;
}

// Desenhar os gráficos comparativos
function renderCharts() {
    const containerConsumo = document.getElementById('chart-container-consumo');
    const containerCusto = document.getElementById('chart-container-custo');
    
    if (!containerConsumo || !containerCusto) return;
    
    if (!state.monthlyHistory || state.monthlyHistory.length === 0) {
        const msg = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0; width: 100%;">
                <i class="fa-solid fa-chart-column" style="font-size: 1.5rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.2);"></i><br>
                Ainda não há dados históricos consolidados. Conclua o ciclo mensal e registre a conta real de água para visualizar as comparações.
            </div>
        `;
        containerConsumo.innerHTML = msg;
        containerCusto.innerHTML = msg;
        return;
    }
    
    // Pegar os últimos 5 meses do histórico
    const lastMonths = state.monthlyHistory.slice(-5);
    
    // Desenhar Gráfico 1: Consumo (Previsto vs Real)
    drawSVGChart(containerConsumo, lastMonths, 'consumoTotal', 'consumoReal', 'L');
    
    // Desenhar Gráfico 2: Custo (Previsto vs Real)
    drawSVGChart(containerCusto, lastMonths, 'valorEstimado', 'valorReal', 'R$');
}

function drawSVGChart(container, data, keyPrevisto, keyReal, unit) {
    const width = 620; // Alterado para 620px de largura fixa para melhorar a relação de aspecto (IHD)
    const height = 350; // Altura total de 350px
    
    // Encontrar o valor máximo para escala
    const maxVal = Math.max(
        ...data.map(d => Math.max(d[keyPrevisto], d[keyReal])),
        unit === 'L' ? 5000 : 50
    ) * 1.25; // 25% de margem no topo para valores sobre as barras
    
    let svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;
    
    // Linhas de Grade e Eixo Y
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = 35 + (i * (height - 85) / gridLines);
        const val = maxVal - (i * maxVal / gridLines);
        
        let label = '';
        if (unit === 'L') {
            label = `${Math.round(val / 1000)}k L`;
        } else {
            label = `R$ ${Math.round(val)}`;
        }
        
        svgContent += `
            <line x1="65" y1="${y}" x2="${width - 15}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
            <text x="52" y="${y + 5}" fill="rgba(255,255,255,0.95)" font-size="14" font-weight="800" text-anchor="end">${label}</text>
        `;
    }
    
    // Desenhar Barras
    const groupWidth = (width - 80) / data.length;
    const barWidth = 32; // Barras bem mais largas e visíveis
    
    data.forEach((d, idx) => {
        const xGroup = 65 + (idx * groupWidth);
        const xPrevisto = xGroup + (groupWidth / 2) - barWidth - 12;
        const xReal = xGroup + (groupWidth / 2) + 12;
        
        const valPrevisto = d[keyPrevisto];
        const valReal = d[keyReal];
        
        const hPrevisto = (valPrevisto / maxVal) * (height - 85);
        const yPrevisto = height - 45 - hPrevisto;
        
        const hReal = (valReal / maxVal) * (height - 85);
        const yReal = height - 45 - hReal;
        
        // Rótulos de valores em cima das barras
        let valLabelPrevisto = '';
        let valLabelReal = '';
        if (unit === 'L') {
            valLabelPrevisto = `${Math.round(valPrevisto).toLocaleString('pt-BR')} L`;
            valLabelReal = `${Math.round(valReal).toLocaleString('pt-BR')} L`;
        } else {
            valLabelPrevisto = `R$ ${Math.round(valPrevisto)}`;
            valLabelReal = `R$ ${Math.round(valReal)}`;
        }
        
        // Barra Previsto (Azul #2563EB)
        svgContent += `
            <rect x="${xPrevisto}" y="${yPrevisto}" width="${barWidth}" height="${hPrevisto}" rx="4" fill="#2563EB" opacity="0.95">
                <title>Previsto: ${valLabelPrevisto}</title>
            </rect>
            <text x="${xPrevisto + barWidth / 2}" y="${yPrevisto - 8}" fill="#ffffff" font-size="13" font-weight="800" text-anchor="middle">${valLabelPrevisto}</text>
        `;
        
        // Barra Real (Verde #16A34A)
        if (valReal > 0) {
            svgContent += `
                <rect x="${xReal}" y="${yReal}" width="${barWidth}" height="${hReal}" rx="4" fill="#16A34A" opacity="0.95">
                    <title>Real: ${valLabelReal}</title>
                </rect>
                <text x="${xReal + barWidth / 2}" y="${yReal - 8}" fill="#ffffff" font-size="13" font-weight="800" text-anchor="middle">${valLabelReal}</text>
            `;
        } else {
            // Pontilhado indicando que não foi informado
            svgContent += `
                <rect x="${xReal}" y="${height - 45}" width="${barWidth}" height="1" fill="rgba(255,255,255,0.2)"/>
                <text x="${xReal + barWidth / 2}" y="${height - 50}" fill="rgba(255,255,255,0.4)" font-size="11" font-weight="700" text-anchor="middle">N/A</text>
            `;
        }
        
        // Rótulo do Mês no eixo X
        const mesLabel = d.period.split(" de ")[0];
        svgContent += `
            <text x="${xGroup + groupWidth / 2}" y="${height - 15}" fill="#ffffff" font-size="16" font-weight="800" text-anchor="middle">${mesLabel}</text>
        `;
    });
    
    svgContent += `</svg>`;
    container.innerHTML = svgContent;
}

// --- Tela Configurações - Inicialização ---
function initSettingsForm() {
    document.getElementById('input-config-meta').value = state.savingsTarget;
    document.getElementById('input-config-tarifa').value = state.waterTariff.toFixed(2);
}
});
