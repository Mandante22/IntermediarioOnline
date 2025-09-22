// === INICIALIZAÇÃO DO SUPABASE ===
const SUPABASE_URL = 'https://liywjnjmbzqlepdzarag.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeXdqbmptYnpxbGVwZHphcmFnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODE1MTUzMiwiZXhwIjoyMDczNzI3NTMyfQ.JOMzpT2aog0rG0pHCJwvfl-pFTF60q3kgLOOijkYOBc';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

document.addEventListener('DOMContentLoaded', async function() {
    console.log('📄 DOM carregado. Iniciando carregamento de componentes...');

    // =============== CACHE GLOBAL ===============
    let cachedAnuncios = null;
    const CACHE_KEY = 'cached_anuncios';
    const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutos

    async function getCachedAnuncios() {
        const now = Date.now();
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (now - timestamp < CACHE_EXPIRY) {
                return data;
            }
        }
        return null;
    }

    async function setCachedAnuncios(data) {
        const cacheData = {
            data,
            timestamp: Date.now()
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    }

    async function fetchAnunciosFromDB() {
        const { data, error } = await supabaseClient
            .from('anuncios')
            .select('*')
            .eq('status', 'ativo');
        if (error) throw error;
        await setCachedAnuncios(data);
        return data;
    }

    async function getAnuncios() {
        let data = await getCachedAnuncios();
        if (!data) {
            data = await fetchAnunciosFromDB();
        }
        return data;
    }

    // --- NOVO CÓDIGO DO MAPA ---
    const chaveOpenCage = 'a1687c8c501b4f6bb05005fedfbd9662';

    async function getCoordinates(localizacao) {
        try {
            const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(localizacao)}&key=${chaveOpenCage}`);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                const firstResult = data.results[0].geometry;
                return { lat: firstResult.lat, lng: firstResult.lng };
            }
            return null;
        } catch (error) {
            console.error('Erro ao obter coordenadas:', error);
            return null;
        }
    }

    // =============== BUSCA POR BAIRRO ===============
    window.buscarAnuncios = async function() {
        const termo = document.getElementById('searchBairro').value.trim().toLowerCase();
        if (!termo) {
            alert('Digite um bairro ou palavra-chave para buscar!');
            return;
        }

        const listaAnuncios = document.getElementById('listaAnuncios');
        const listaResultados = document.getElementById('listaResultados');
        const termoBuscaSpan = document.getElementById('termoBusca');

        listaAnuncios.innerHTML = `<div class="text-center"><div class="spinner-border text-danger" role="status"><span class="visually-hidden">Carregando...</span></div></div>`;
        listaResultados.classList.remove('d-none');
        termoBuscaSpan.textContent = termo;

        try {
            const { data, error } = await supabaseClient
                .from('anuncios')
                .select('*')
                .eq('status', 'ativo')
                .or(`localizacao.ilike.%${termo}%,descricao.ilike.%${termo}%`);

            if (error) throw error;

            listaAnuncios.innerHTML = '';

            if (!data || data.length === 0) {
                listaAnuncios.innerHTML = '<div class="col-12"><div class="alert alert-info">Nenhum anúncio encontrado para esta busca.</div></div>';
                return;
            }

            // Obter top 3 visualizados hoje
            const top3Ids = getTop3Visualizados();

            let html = '';
            data.forEach(anuncio => {
                const fotos = anuncio.fotos ? JSON.parse(anuncio.fotos) : [];
                const fotoPrincipal = fotos[0] || anuncio.comprovante || 'https://via.placeholder.com/400x200?text=Sem+Foto';

                // Verificar se é novo (menos de 24h)
                const publicacao = new Date(anuncio.datacriacao);
                const agora = new Date();
                const diffHoras = Math.floor((agora - publicacao) / (1000 * 60 * 60));
                let novoBadge = '';
                if (diffHoras <= 24) {
                    novoBadge = '<span class="badge bg-danger text-white ms-2">🆕 Novo!</span>';
                }

                // Verificar se é top visualizado
                let topBadge = '';
                if (top3Ids.includes(anuncio.id)) {
                    topBadge = '<span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2">🔥 Mais Procurado!</span>';
                }

                // Formatar tempo de publicação
                const tempoPublicacao = formatarTempoPublicacao(anuncio.datacriacao);

                html += `
                    <div class="col-md-4 mb-4">
                        <div class="card h-100 shadow-sm position-relative">
                            ${topBadge}
                            <img src="${fotoPrincipal}" alt="${anuncio.titulo}" class="card-img-top" style="height: 200px; object-fit: cover;">
                            <div class="card-body">
                                <h5 class="card-title">${anuncio.titulo} ${novoBadge}</h5>
                                <p class="card-text">${anuncio.descricao.substring(0, 100)}...</p>
                                <p class="text-red fw-bold">${anuncio.preco.toLocaleString('pt-AO')} Kz/mês</p>
                                <p class="text-muted">📍 ${anuncio.localizacao}</p>
                                <p class="text-muted small"><i class="far fa-clock"></i> ${tempoPublicacao}</p>
                                <button class="btn btn-outline-danger w-100 mb-2 abrir-chat" data-dono="Proprietário" data-whatsapp="${anuncio.contacto}">
                                    💬 Contactar
                                </button>
                                <a href="https://wa.me/${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-whatsapp w-100 mb-2" target="_blank">
                                    📱 WhatsApp
                                </a>
                                <a href="tel:+244${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-outline-dark w-100" target="_blank">
                                    <i class="fas fa-phone"></i> Ligar agora
                                </a>
                                <button class="btn btn-outline-secondary w-100 mt-2" onclick="compartilharAnuncio('${anuncio.id}', '${anuncio.titulo}')">
                                    <i class="fas fa-share-alt"></i> Compartilhar
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });

            listaAnuncios.innerHTML = html;
            listaResultados.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error("Erro na busca:", error);
            listaAnuncios.innerHTML = `<p class="text-center text-danger">Erro ao buscar anúncios. Tente novamente.</p>`;
        }
    };

    // Permitir busca com Enter
    document.getElementById('searchBairro').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            buscarAnuncios();
        }
    });

    // =============== FILTRO POR PREÇO ===============
    window.filtrarPorPreco = async function(faixa) {
        let precoMin, precoMax;
        switch(faixa) {
            case 'ate50': precoMin = 0; precoMax = 50000; break;
            case '50a100': precoMin = 50001; precoMax = 100000; break;
            case 'acima100': precoMin = 100001; precoMax = 999999999; break;
        }

        const { data, error } = await supabaseClient
            .from('anuncios')
            .select('*')
            .eq('status', 'ativo')
            .gte('preco', precoMin)
            .lte('preco', precoMax);

        if (error) {
            alert('Erro ao filtrar por preço.');
            return;
        }

        exibirResultadosFiltrados(data, `Filtrado por preço: ${faixa}`);
    };

    window.limparFiltroPreco = function() {
        document.getElementById('searchBairro').value = '';
        buscarAnuncios();
    };

    // Função auxiliar para exibir resultados (reutilizável)
    function exibirResultadosFiltrados(data, termo = 'Resultados') {
        const listaAnuncios = document.getElementById('listaAnuncios');
        const listaResultados = document.getElementById('listaResultados');
        const termoBuscaSpan = document.getElementById('termoBusca');

        listaResultados.classList.remove('d-none');
        termoBuscaSpan.textContent = termo;

        if (!data || data.length === 0) {
            listaAnuncios.innerHTML = '<div class="col-12"><div class="alert alert-info">Nenhum anúncio encontrado com este filtro.</div></div>';
            return;
        }

        // Obter top 3 visualizados hoje
        const top3Ids = getTop3Visualizados();

        let html = '';
        data.forEach(anuncio => {
            const fotos = anuncio.fotos ? JSON.parse(anuncio.fotos) : [];
            const fotoPrincipal = fotos[0] || anuncio.comprovante || 'https://via.placeholder.com/400x200?text=Sem+Foto';

            // Verificar se é novo (menos de 24h)
            const publicacao = new Date(anuncio.datacriacao);
            const agora = new Date();
            const diffHoras = Math.floor((agora - publicacao) / (1000 * 60 * 60));
            let novoBadge = '';
            if (diffHoras <= 24) {
                novoBadge = '<span class="badge bg-danger text-white ms-2">🆕 Novo!</span>';
            }

            // Verificar se é top visualizado
            let topBadge = '';
            if (top3Ids.includes(anuncio.id)) {
                topBadge = '<span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2">🔥 Mais Procurado!</span>';
            }

            // Formatar tempo de publicação
            const tempoPublicacao = formatarTempoPublicacao(anuncio.datacriacao);

            html += `
                <div class="col-md-4 mb-4">
                    <div class="card h-100 shadow-sm position-relative">
                        ${topBadge}
                        <img src="${fotoPrincipal}" alt="${anuncio.titulo}" class="card-img-top" style="height: 200px; object-fit: cover;">
                        <div class="card-body">
                            <h5 class="card-title">${anuncio.titulo} ${novoBadge}</h5>
                            <p class="card-text">${anuncio.descricao.substring(0, 100)}...</p>
                            <p class="text-red fw-bold">${anuncio.preco.toLocaleString('pt-AO')} Kz/mês</p>
                            <p class="text-muted">📍 ${anuncio.localizacao}</p>
                            <p class="text-muted small"><i class="far fa-clock"></i> ${tempoPublicacao}</p>
                            <button class="btn btn-outline-danger w-100 mb-2 abrir-chat" data-dono="Proprietário" data-whatsapp="${anuncio.contacto}">
                                💬 Contactar
                            </button>
                            <a href="https://wa.me/${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-whatsapp w-100 mb-2" target="_blank">
                                📱 WhatsApp
                            </a>
                            <a href="tel:+244${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-outline-dark w-100" target="_blank">
                                <i class="fas fa-phone"></i> Ligar agora
                            </a>
                            <button class="btn btn-outline-secondary w-100 mt-2" onclick="compartilharAnuncio('${anuncio.id}', '${anuncio.titulo}')">
                                <i class="fas fa-share-alt"></i> Compartilhar
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        listaAnuncios.innerHTML = html;
        listaResultados.scrollIntoView({ behavior: 'smooth' });
    }

    // =============== FUNÇÕES AUXILIARES ===============
    function formatarTempoPublicacao(datacriacao) {
        const agora = new Date();
        const publicacao = new Date(datacriacao);
        const diffMs = agora - publicacao;
        const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDias = Math.floor(diffHoras / 24);

        if (diffHoras < 1) return 'Publicado há instantes';
        if (diffHoras < 24) return `Publicado há ${diffHoras} hora${diffHoras !== 1 ? 's' : ''}`;
        if (diffDias === 1) return 'Publicado ontem';
        if (diffDias < 7) return `Publicado há ${diffDias} dias`;
        return `Publicado em ${publicacao.toLocaleDateString('pt-AO')}`;
    }

    function registrarVisualizacao(id) {
        const hoje = new Date().toISOString().split('T')[0]; // "2025-04-05"
        const chave = `visualizacoes_${hoje}`;
        let visualizacoes = JSON.parse(localStorage.getItem(chave) || '{}');
        visualizacoes[id] = (visualizacoes[id] || 0) + 1;
        localStorage.setItem(chave, JSON.stringify(visualizacoes));
    }

    function getTop3Visualizados() {
        const hoje = new Date().toISOString().split('T')[0];
        const visualizacoes = JSON.parse(localStorage.getItem(`visualizacoes_${hoje}`) || '{}');
        return Object.entries(visualizacoes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id]) => id);
    }

    window.compartilharAnuncio = function(id, titulo) {
        const url = `${window.location.origin}${window.location.pathname}#anuncio-${id}`;
        const texto = `Olha este imóvel: ${titulo} - Encontrei no Intermediário Online! ${url}`;

        if (navigator.share) {
            navigator.share({
                title: 'Intermediário Online',
                text: texto,
                url: url
            }).catch(console.error);
        } else {
            // Fallback: copiar link
            navigator.clipboard.writeText(url).then(() => {
                alert('Link copiado! Cole no WhatsApp, Facebook ou onde quiser.');
            }).catch(err => {
                alert('Erro ao copiar link: ' + err);
            });
        }
    };

    window.compartilharAnuncioModal = function() {
        const titulo = document.getElementById('modalTitulo').textContent;
        const id = document.querySelector('#modalVerMaisFotos').dataset.anuncioId;
        compartilharAnuncio(id, titulo);
    };

    // =============== CONTADOR DE ANÚNCIOS ===============
    async function atualizarContadorAnuncios() {
        const { count, error } = await supabaseClient
            .from('anuncios')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'ativo');

        if (error) {
            console.error('Erro ao contar anúncios:', error);
            return;
        }

        const contadorElement = document.getElementById('contadorAnuncios');
        if (contadorElement) {
            contadorElement.innerHTML = `✅ <strong>${count.toLocaleString('pt-AO')}</strong> imóveis anunciados hoje!`;
        }
    }

    // =============== CARROSSEL DE DESTAQUES (1 ANÚNCIO POR VEZ) ===============
    let currentDestaqueIndex = 0;
    let destaqueInterval;

    async function carregarCarrosselDestaque() {
        const carouselContainer = document.getElementById('carouselDestaque');
        if (!carouselContainer) return;

        try {
            const data = await getAnuncios();
            if (!data || data.length === 0) {
                carouselContainer.innerHTML = '<p class="text-center text-muted">Nenhum anúncio disponível no momento.</p>';
                return;
            }

            // Obter top 3 visualizados hoje
            const top3Ids = getTop3Visualizados();

            // Limpa container
            carouselContainer.innerHTML = '';

            // Cria um slide para CADA anúncio
            data.forEach((anuncio, index) => {
                const fotos = anuncio.fotos ? JSON.parse(anuncio.fotos) : [];
                const todasFotos = [anuncio.fotoPrincipal, ...(fotos || [])].filter(f => f);
                const fotoPrincipal = todasFotos[0] || 'https://via.placeholder.com/400x300?text=Sem+Foto';

                // Verificar se é novo (menos de 24h)
                const publicacao = new Date(anuncio.datacriacao);
                const agora = new Date();
                const diffHoras = Math.floor((agora - publicacao) / (1000 * 60 * 60));
                let novoBadge = '';
                if (diffHoras <= 24) {
                    novoBadge = '<span class="badge bg-danger text-white ms-2">🆕 Novo!</span>';
                }

                // Verificar se é top visualizado
                let topBadge = '';
                if (top3Ids.includes(anuncio.id)) {
                    topBadge = '<span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2">🔥 Mais Procurado!</span>';
                }

                // Formatar tempo de publicação
                const tempoPublicacao = formatarTempoPublicacao(anuncio.datacriacao);

                const slideDiv = document.createElement('div');
                slideDiv.className = `carousel-slide ${index === 0 ? 'active' : ''}`;
                slideDiv.style.display = index === 0 ? 'block' : 'none';
                slideDiv.innerHTML = `
                    <div class="card shadow-lg" style="border-radius: 15px; overflow: hidden; height: 100%;">
                        <div class="position-relative">
                            ${topBadge}
                            <img src="${fotoPrincipal}" 
                                 alt="${anuncio.titulo}" 
                                 class="w-100 img-destaque" 
                                 data-anuncio-id="${anuncio.id}"
                                 style="height: 300px; object-fit: cover; cursor: pointer;"
                                 data-bs-toggle="modal"
                                 data-bs-target="#modalVerMaisFotos">
                            <div class="position-absolute bottom-0 start-0 p-2 bg-black bg-opacity-50 text-white w-100">
                                <small><i class="far fa-clock"></i> ${tempoPublicacao}</small>
                            </div>
                        </div>
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title">${anuncio.titulo} ${novoBadge}</h5>
                            <p class="card-text flex-grow-1">${anuncio.descricao.substring(0, 120)}...</p>
                            <p class="text-red fw-bold fs-5">${anuncio.preco.toLocaleString('pt-AO')} Kz/mês</p>
                            <p class="text-muted"><i class="fas fa-map-marker-alt"></i> ${anuncio.localizacao}</p>
                            <a href="https://wa.me/${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-whatsapp w-100 mb-2" target="_blank">
                                📱 WhatsApp
                            </a>
                            <a href="tel:+244${anuncio.contacto.replace(/\D/g, '')}" class="btn btn-outline-dark w-100" target="_blank">
                                <i class="fas fa-phone"></i> Ligar agora
                            </a>
                            <button class="btn btn-outline-secondary w-100 mt-2" onclick="compartilharAnuncio('${anuncio.id}', '${anuncio.titulo}')">
                                <i class="fas fa-share-alt"></i> Compartilhar
                            </button>
                        </div>
                    </div>
                `;

                // Se tiver mais de 1 foto, inicia rotação da imagem principal
                if (todasFotos.length > 1) {
                    const imgElement = slideDiv.querySelector('img');
                    let fotoIndex = 0;
                    setInterval(() => {
                        fotoIndex = (fotoIndex + 1) % todasFotos.length;
                        imgElement.style.opacity = '0';
                        setTimeout(() => {
                            imgElement.src = todasFotos[fotoIndex];
                            imgElement.style.opacity = '1';
                        }, 500);
                    }, 20000); // Muda a foto a cada 20 segundos
                }

                // Adiciona evento de clique para abrir modal
                try {
                    const imgDestaque = slideDiv.querySelector('.img-destaque');
                    if (imgDestaque) {
                        imgDestaque.addEventListener('click', function() {
                            const anuncioId = this.getAttribute('data-anuncio-id');
                            abrirModalGaleria(anuncioId);
                        });
                    }
                } catch (error) {
                    console.error("Erro ao adicionar evento de clique:", error);
                }

                carouselContainer.appendChild(slideDiv);
            });

           // Configura controles manuais
const btnPrev = document.getElementById('btnPrevDestaque');
const btnNext = document.getElementById('btnNextDestaque');

if (btnPrev) {
    btnPrev.addEventListener('click', () => {
        showDestaqueSlide(currentDestaqueIndex - 1, data.length);
    });
}

if (btnNext) {
    btnNext.addEventListener('click', () => {
        showDestaqueSlide(currentDestaqueIndex + 1, data.length);
    });
}
            
            // Inicia rotação automática
            startAutoRotateDestaque(data.length);

            console.log('✅ Carrossel de destaques (1 por vez) carregado com sucesso.');

        } catch (error) {
            console.error('❌ Erro ao carregar carrossel de destaques:', error);
            carouselContainer.innerHTML = '<p class="text-center text-danger">Erro ao carregar destaques.</p>';
        }
    }

    function startAutoRotateDestaque(totalSlides) {
        clearInterval(destaqueInterval);
        if (totalSlides <= 1) return;

        destaqueInterval = setInterval(() => {
            showDestaqueSlide(currentDestaqueIndex + 1, totalSlides);
        }, 8000); // 8 segundos
    }

    function showDestaqueSlide(index, totalSlides) {
        const slides = document.querySelectorAll('.carousel-slide');
        if (slides.length === 0) return;

        currentDestaqueIndex = (index + totalSlides) % totalSlides;

        slides.forEach((slide, i) => {
            slide.style.display = i === currentDestaqueIndex ? 'block' : 'none';
        });
    }

    // =============== MAPA INTERATIVO ===============
    async function carregarImoveisNoMapa() {
        try {
            if (!window.mapaInstance) {
                const angola = { lat: -11.2027, lng: 17.8739 };
                window.mapaInstance = L.map('mapa-interativo').setView(angola, 5);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 18,
                }).addTo(window.mapaInstance);
            }

            window.mapaInstance.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
                    window.mapaInstance.removeLayer(layer);
                }
            });

            // Mostrar spinner
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'spinner-border text-danger position-absolute top-50 start-50';
            loadingDiv.setAttribute('role', 'status');
            loadingDiv.innerHTML = '<span class="visually-hidden">Carregando...</span>';
            document.getElementById('mapa-interativo').appendChild(loadingDiv);

            const { data, error } = await supabaseClient
                .from('anuncios')
                .select('*')
                .eq('status', 'ativo');

            if (error) throw error;

            for (const anuncio of data) {
                let coords = null;

                if (anuncio.latitude && anuncio.longitude) {
                    coords = { lat: anuncio.latitude, lng: anuncio.longitude };
                } else {
                    coords = await getCoordinates(anuncio.localizacao);
                    if (coords) {
                        await supabaseClient
                            .from('anuncios')
                            .update({
                                latitude: coords.lat,
                                longitude: coords.lng
                            })
                            .eq('id', anuncio.id);
                    }
                }

                if (coords) {
                    const marker = L.marker([coords.lat, coords.lng]).addTo(window.mapaInstance);
                    marker.bindTooltip(`
                        <div class="seta-tooltip">
                            <h5 class="mb-0">${anuncio.titulo}</h5>
                            <p class="mb-1">${anuncio.preco.toLocaleString('pt-AO')} Kz/mês</p>
                            <p class="mb-1"><strong>WhatsApp:</strong> ${anuncio.contacto}</p>
                            <a href="https://wa.me/${anuncio.contacto.replace(/\D/g, '')}" target="_blank" class="text-white-50 small">
                                📱 Mensagem agora
                            </a>
                        </div>
                    `).openTooltip();
                }
            }

            loadingDiv.remove();
            console.log('✅ Marcadores do mapa carregados com sucesso.');

        } catch (error) {
            console.error("Erro ao carregar anúncios para o mapa:", error);
            const loadingDiv = document.querySelector('#mapa-interativo .spinner-border');
            if (loadingDiv) loadingDiv.remove();
            alert('Erro ao carregar mapa de anúncios.');
        }
    }

    // =============== DOWNLOAD CONTRATO ===============
    window.downloadContrato = function() {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = function() {
            const { jsPDF } = window.jspdf;

            const doc = new jsPDF();
            doc.setFontSize(20);
            doc.text('CONTRATO DE ARRENDAMENTO', 14, 20);
            doc.setFontSize(12);
            doc.text([
                'Este contrato é celebrado entre:',
                '',
                'SENHORIO:',
                'Nome: __________________________________________________',
                'BI: _____________________________________________________',
                'Contacto: _______________________________________________',
                '',
                'INQUILINO:',
                'Nome: __________________________________________________',
                'BI: _____________________________________________________',
                'Contacto: _______________________________________________',
                '',
                'IMÓVEL:',
                'Endereço: _______________________________________________',
                'Valor: ______________________ Kz/mês',
                'Duração: _____ meses',
                '',
                'Luanda, ___ de ___________ de 2025',
                '',
                '___________________________     ___________________________',
                '         SENHORIO                         INQUILONO'
            ], 14, 40);

            doc.save('contrato_arrendamento_intermediario_online.pdf');
        };
        document.head.appendChild(script);
    };

    // Sanitiza nomes de arquivos
    function sanitizeFileName(name) {
        return name
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/\s+/g, '_');
    }

    // =============== ABRIR MODAL DE GALERIA ===============
    window.abrirModalGaleria = async function(anuncioId) {
        const { data: anuncio, error } = await supabaseClient
            .from('anuncios')
            .select('*')
            .eq('id', anuncioId)
            .single();

        if (error) {
            console.error('Erro ao carregar anúncio:', error);
            return;
        }

        // Registrar visualização
        registrarVisualizacao(anuncioId);

        document.getElementById('modalFotoPrincipal').src = anuncio.fotoPrincipal;
        document.getElementById('modalTitulo').textContent = anuncio.titulo;
        document.getElementById('modalPreco').textContent = `${anuncio.preco.toLocaleString('pt-AO')} Kz/mês`;
        document.getElementById('modalLocalizacao').textContent = anuncio.localizacao;
        document.getElementById('modalDescricao').textContent = anuncio.descricao;
        document.getElementById('modalWhatsapp').href = `https://wa.me/${anuncio.contacto.replace(/\D/g, '')}`;
        document.getElementById('modalLigar').href = `tel:+244${anuncio.contacto.replace(/\D/g, '')}`;
        
        // Armazenar ID no modal para compartilhamento
        document.querySelector('#modalVerMaisFotos').dataset.anuncioId = anuncioId;

        const galeria = document.getElementById('modalGaleria');
        galeria.innerHTML = '';

        const fotos = anuncio.fotos ? JSON.parse(anuncio.fotos) : [];

        if (fotos && fotos.length > 0) {
            fotos.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.style.cursor = 'pointer';
                img.onclick = () => {
                    document.getElementById('modalFotoPrincipal').src = url;
                };
                galeria.appendChild(img);
            });
        }

        if (!fotos.includes(anuncio.fotoPrincipal)) {
            const img = document.createElement('img');
            img.src = anuncio.fotoPrincipal;
            img.style.cursor = 'pointer';
            img.onclick = () => {
                document.getElementById('modalFotoPrincipal').src = anuncio.fotoPrincipal;
            };
            galeria.appendChild(img);
        }
    };

    // =============== ENVIO DO ANÚNCIO (FORMULÁRIO) ===============
    document.getElementById('formularioAnuncio').addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const btnSubmit = this.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'A enviar...';

        const titulo = document.getElementById('titulo').value;
        const descricao = document.getElementById('descricao').value;
        const localizacao = document.getElementById('localizacao').value;
        const preco = parseFloat(document.getElementById('preco').value);
        const contacto = document.getElementById('contacto').value;
        const pagamento = document.querySelector('input[name="pagamento"]:checked')?.value;
        const fotoPrincipalFile = document.getElementById('fotoPrincipal').files[0];
        const comprovanteFile = document.getElementById('comprovante').files[0];
        const fotosAdicionaisFiles = document.getElementById('fotosAdicionais')?.files || [];

        try {
            // Upload da foto principal
            const safeFotoPrincipalName = sanitizeFileName(fotoPrincipalFile.name);
            const fotoPrincipalPath = `public/${Date.now()}_${safeFotoPrincipalName}`;

            const { error: fotoPrincipalError } = await supabaseClient.storage
                .from('fotos')
                .upload(fotoPrincipalPath, fotoPrincipalFile);

            if (fotoPrincipalError) {
                throw new Error("Erro ao fazer upload da foto principal.");
            }

            const { data: fotoPrincipalUrlData } = await supabaseClient.storage
                .from('fotos')
                .getPublicUrl(fotoPrincipalPath);

            if (!fotoPrincipalUrlData || !fotoPrincipalUrlData.publicUrl) {
                throw new Error("Erro ao obter URL da foto principal.");
            }

            // Upload do comprovante
            const safeComprovanteName = sanitizeFileName(comprovanteFile.name);
            const comprovantePath = `public/${Date.now()}_${safeComprovanteName}`;

            const { error: comprovanteError } = await supabaseClient.storage
                .from('comprovantes')
                .upload(comprovantePath, comprovanteFile);

            if (comprovanteError) {
                throw new Error("Erro ao fazer upload do comprovante.");
            }

            const { data: comprovanteUrlData } = await supabaseClient.storage
                .from('comprovantes')
                .getPublicUrl(comprovantePath);

            if (!comprovanteUrlData || !comprovanteUrlData.publicUrl) {
                throw new Error("Erro ao obter URL do comprovante.");
            }

            // Upload das fotos adicionais
            let fotosUrls = [];

            for (const file of fotosAdicionaisFiles) {
                const safeFileName = sanitizeFileName(file.name);
                const fotoPath = `public/${Date.now()}_${safeFileName}`;

                const { error: fotoError } = await supabaseClient.storage
                    .from('fotos')
                    .upload(fotoPath, file);

                if (fotoError) {
                    throw new Error("Erro ao fazer upload de uma foto adicional.");
                }

                const { data: fotoUrlData } = await supabaseClient.storage
                    .from('fotos')
                    .getPublicUrl(fotoPath);

                if (!fotoUrlData || !fotoUrlData.publicUrl) {
                    throw new Error("Erro ao obter URL de uma foto adicional.");
                }

                fotosUrls.push(fotoUrlData.publicUrl);
            }

            // ✅ INSERIR NOVO ANÚNCIO
            const { error: dbError } = await supabaseClient
                .from('anuncios')
                .insert({
                    titulo,
                    descricao,
                    localizacao,
                    preco,
                    contacto,
                    pagamento,
                    status: 'pendente',
                    comprovante: comprovanteUrlData.publicUrl,
                    fotoPrincipal: fotoPrincipalUrlData.publicUrl,
                    fotos: fotosUrls.length > 0 ? JSON.stringify(fotosUrls) : null,
                });

            if (dbError) throw dbError;

            alert('🎉 Anúncio enviado com sucesso! Seu anúncio será revisado em até 1h.');
            this.reset();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar. Tente novamente. Detalhe: " + error.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Enviar Anúncio';
        }
    });

        // Chamadas iniciais
    await atualizarContadorAnuncios();
    await carregarCarrosselDestaque();
    await carregarImoveisNoMapa();

    // ✅ Correção de acessibilidade: foco no modal
    document.getElementById('modalVerMaisFotos').addEventListener('shown.bs.modal', function() {
        const firstFocusable = this.querySelector('button, [href], input, select, textarea');
        if (firstFocusable) {
            firstFocusable.focus();
        }
    });
});
