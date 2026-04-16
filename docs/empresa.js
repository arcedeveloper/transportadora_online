class PanelEmpresas {
    constructor() {
        this.empresaData = this.obtenerDatosEmpresa();
        this.ID_EMPRESA = this.empresaData.empresa_id;
        this.mapaCentrado = false;
        this.usuarioMoviendoMapa = false;
        this.timeoutControlManual = null;
        this.lineOptions = {
    color: '#3b82f6',
    weight: 4,
    opacity: 0.8,
    lineCap: 'round',
    lineJoin: 'round',
    className: 'ruta-historica'
};
this.popupsPunta = {};

        
        if (!this.ID_EMPRESA) {
            this.redirigirALogin();
            return;
        }

        this.transportistas = [];
        this.viajes = [];
        this.BASE_URL = 'http://localhost:3000/api';
        this.CHAT_URL = 'http://localhost:3000/api';
        this.transportistaChatSeleccionado = null;
        this.chatIdActual = null;
        this.socket = null;
        this.reportesData = {
            viajes: [],
            ingresos: [],
            transportistas: []
        };
        
        this.viajesActivos = [];
        this.mapa = null;
        this.marcadores = {};
        this.intervaloTracking = null;
        this.rutasActivas = {}; 
        this.waypoints = {}; 
        this.maxWaypoints = 100; 
        this.rutasHistoricas = {}; 
        this.historicoUbicaciones = {}; 
        this.maxPuntosRuta = 200; 
        this.popupsExternos = {}; 
        
        this.init();
    }

    obtenerDatosEmpresa() {
        try {
            const empresaGuardada = localStorage.getItem('empresa');
            if (empresaGuardada) {
                const data = JSON.parse(empresaGuardada);
                return {
                    empresa_id: data.empresa_id || data.id,
                    nombre_titular: data.nombre_titular || data.correo?.split('@')[0] || 'Administrador',
                    nombre_empresa: data.nombre_empresa || `Empresa #${data.empresa_id || data.id}`
                };
            }
            
            const userData = localStorage.getItem('adminUser');
            if (userData) {
                const user = JSON.parse(userData);
                return {
                    empresa_id: user.empresa_id,
                    nombre_titular: user.correo?.split('@')[0] || 'Administrador',
                    nombre_empresa: user.empresa_nombre || `Empresa #${user.empresa_id}`
                };
            }
            
            return {};
        } catch (error) {
            console.error('Error obteniendo datos empresa:', error);
            return {};
        }
    }

    async init() {
        this.actualizarUIUsuario();
        this.setupEventListeners();
        
        this.conectarWebSocket();
        await this.cargarDatosIniciales();

        this.configurarEventListenersGastos();
    await this.cargarGastosFijos();

        this.configurarFormatoMonto();
    
            const contadorInicial = parseInt(localStorage.getItem('unreadCount') || '0');
    this.actualizarContadorEmpresa(contadorInicial);
    this.actualizarTituloPestana(contadorInicial);
    }

    actualizarUIUsuario() {
        const { nombre_titular, nombre_empresa } = this.empresaData;
        
        const userNameElement = document.getElementById('userName');
        const userAvatarElement = document.getElementById('userAvatar');
        const logoElement = document.querySelector('.logo span');
        
        if (userNameElement && nombre_titular) {
            userNameElement.textContent = nombre_titular;
        }
        
        if (userAvatarElement && nombre_titular) {
            userAvatarElement.textContent = this.obtenerIniciales(nombre_titular);
        }
        
        if (logoElement && nombre_empresa) {
            logoElement.textContent = nombre_empresa;
        }
    }

    obtenerIniciales(nombre) {
        if (!nombre) return 'JC';
        return nombre.split(' ')
                   .map(n => n[0])
                   .join('')
                   .toUpperCase()
                   .substring(0, 2);
    }

    setupEventListeners() {
        console.log('🔧 Configurando event listeners...');
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const seccion = item.getAttribute('data-seccion');
                this.abrirSeccion(seccion);
            });
        });

        document.getElementById('btnActualizar')?.addEventListener('click', () => {
            this.cargarDatosIniciales();
        });
        
        document.getElementById('btnFiltrar')?.addEventListener('click', () => this.filtrarViajes());
        
        document.getElementById('btnActualizarTransportistas')?.addEventListener('click', () => {
            this.cargarTransportistas();
        });
        
        document.getElementById('btnActualizarEnvios')?.addEventListener('click', () => {
            this.cargarViajes();
        });
        
        document.getElementById('btnActualizarTracking')?.addEventListener('click', () => {
            this.recargarTrackingCompleto();
        });
        
        document.getElementById('btnActualizarReportes')?.addEventListener('click', () => {
            this.recargarReportesCompleto();
        });
        
        document.getElementById('btnExportarPDF')?.addEventListener('click', () => this.exportarPDF());
        document.getElementById('btnEnviarMensaje')?.addEventListener('click', () => this.enviarMensajeChat());
        document.getElementById('btnCerrarSesion')?.addEventListener('click', () => this.cerrarSesion());
        
        document.getElementById('inputMensaje')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.enviarMensajeChat();
            }
        });
    }

    async cargarDatosIniciales() {
        try {
            console.log('🚀 Cargando datos iniciales...');
            
            await Promise.all([
                this.cargarTransportistas(),
                this.cargarViajes()
            ]);
            
            await this.cargarMetricas();
            
        } catch (error) {
            console.error('❌ Error cargando datos iniciales:', error);
            this.mostrarError('Error cargando datos iniciales');
        }
    }

    async cargarTransportistas() {
        const container = document.getElementById('transportistas-container');
        if (!container) return;

        try {
            this.mostrarLoading(container, 'Cargando transportistas...');
            
            const token = localStorage.getItem('adminToken');
            if (!token) {
                throw new Error('No hay token de autenticación');
            }

            const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/transportistas-disponibles`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
           if (!response.ok) {
    throw new Error(`Error HTTP: ${response.status}`);
}
            
            const data = await response.json();
            
            console.log('Transportistas disponibles:', data);
            
            if (data.success) {
                this.transportistas = data.transportistas || [];
                console.log(`📋 ${this.transportistas.length} transportistas disponibles cargados`);
                this.mostrarTransportistas();
            } else {
                throw new Error(data.message || 'Error en la respuesta');
            }
            
        } catch (error) {
            console.error('❌ Error cargando transportistas:', error);
            container.innerHTML = this.crearEstadoError('Error cargando transportistas: ' + error.message);
        }
    }

    mostrarTransportistas() {
        const container = document.getElementById('transportistas-container');
        if (!container) return;

        const transportistasDisponibles = this.transportistas.filter(t => 
            t.estado && t.estado.toLowerCase() === 'libre'
        );

        console.log(`🎯 Transportistas a mostrar: ${transportistasDisponibles.length}`);

        if (transportistasDisponibles.length === 0) {
            container.innerHTML = this.crearEstadoVacio('No hay transportistas disponibles en este momento');
            return;
        }

        container.innerHTML = transportistasDisponibles.map(transportista => {
            const pesoMaximo = transportista.peso_maximo || 'No especificado';
            const licencia = transportista.licencia || 'No especificada';
            const cedula = transportista.cedula || 'N/A';
            
            return `
                <div class="card libre">
                    <div class="card-header">
                        <div class="card-title">${transportista.nombre || 'N/A'}</div>
                        <span class="status-badge badge-libre">
                            🟢 Disponible
                        </span>
                    </div>
                    <div class="card-content">
                        ${this.crearFilaCard('📞', transportista.telefono || 'No disponible')}
                        ${this.crearFilaCard('🔑', transportista.vehiculo || 'No especificado')}
                        ${this.crearFilaCard('⚖️', `Peso máximo: ${pesoMaximo}`)}
                        ${this.crearFilaCard('🆔', `CI: ${cedula}`)}
                        ${this.crearFilaCard('📄', `Licencia: ${licencia}`)}
                        ${transportista.esta_en_base ? 
                            this.crearFilaCard('📍', 'En base de operaciones') : 
                            this.crearFilaCard('📍', 'Fuera de base')
                        }
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-outline" onclick="panelEmpresas.iniciarChatConTransportista(${transportista.id_transportista}, '${(transportista.nombre || 'Transportista').replace(/'/g, "\\'")}')">
                            <i class="fas fa-comments"></i> Iniciar Chat
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

actualizarContadorEmpresa(cantidad, ultimoTransportista = null) {
    const badgeElement = document.getElementById('badgeChats');
    if (badgeElement) {
        if (cantidad > 0) {
            let texto = cantidad.toString();
            if (ultimoTransportista && cantidad === 1) {
                texto = `${ultimoTransportista}`;
            } 
            else if (ultimoTransportista && cantidad > 1) {
                texto = `${cantidad} (${ultimoTransportista})`;
            }
            else {
                texto = cantidad.toString();
            }
            
            badgeElement.textContent = texto;
            badgeElement.style.display = 'flex';
        } else {
            badgeElement.style.display = 'none';
        }
    }
}

mostrarNotificacionSimple(mensaje) {
    console.log('💬 Nuevo mensaje:', mensaje);
}

actualizarTituloPestana(cantidad) {
    if (cantidad > 0) {
        document.title = `(${cantidad}) Panel Empresarial`;
    } else {
        document.title = 'Panel Empresarial';
    }
}

    async cargarViajes() {
        const container = document.getElementById('envios-container');
        if (!container) return;

        try {
            this.mostrarLoading(container, 'Cargando envíos...');
            
            const token = localStorage.getItem('adminToken');
            if (!token) {
                throw new Error('No hay token de autenticación');
            }

            const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/envios`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
          if (!response.ok) {
    throw new Error(`Error HTTP: ${response.status}`);
}
            
            const data = await response.json();
            
            if (data.success) {
                this.viajes = data.envios || [];
                await this.mostrarViajesConGastos();
            } else {
                throw new Error(data.message || 'Error en la respuesta');
            }
            
        } catch (error) {
            console.error('❌ Error cargando envíos:', error);
            container.innerHTML = this.crearEstadoError('Error cargando envíos: ' + error.message);
        }
    }

    async mostrarViajesConGastos(viajes = null) {
        const container = document.getElementById('envios-container');
        if (!container) return;

        const viajesAMostrar = viajes || this.viajes;
        const enviosActivos = viajesAMostrar.filter(viaje => {
            const estado = viaje.estado;
            return estado !== 'ENTREGADO';
        });

        if (enviosActivos.length === 0) {
            container.innerHTML = this.crearEstadoVacio('No hay envíos activos en este momento');
            return;
        }

        const idsEnvios = enviosActivos.map(v => v.id_envio).filter(Boolean);
        const gastosPorEnvio = await this.cargarGastosPorEnvios(idsEnvios);

        container.innerHTML = await Promise.all(
            enviosActivos.map(async (viaje) => {
                const gastos = gastosPorEnvio[viaje.id_envio] || 0;
                const gananciaNeta = (parseFloat(viaje.costo) || 0) - gastos;

                return `
                    <div class="card ${this.obtenerClaseEstado(viaje.estado)}" data-viaje-id="${viaje.id_pedido}">
                        <div class="card-header">
                            <div class="card-title">📦 Envío #${viaje.id_envio || viaje.id_pedido}</div>
                            <span class="status-badge ${this.obtenerClaseBadge(viaje.estado)}">
                                ${this.obtenerTextoEstado(viaje.estado)}
                            </span>
                        </div>
                        <div class="card-content">
                            ${this.crearFilaCard('📋', viaje.descripcion || 'Sin descripción', 'Descripción')}
                            ${this.crearFilaCard('🛣️', `${viaje.direccion_origen || 'Origen'} → ${viaje.direccion_destino || 'Destino'}`, 'Ruta')}
                            ${this.crearFilaCard('📅', this.formatearFecha(viaje.fecha_envio), 'Fecha envío')}
                            ${this.crearFilaCard('💰', this.formatearGuaranies(viaje.costo), 'Ingreso')}
                            ${this.crearFilaCard('💸', this.formatearGuaranies(gastos), 'Gastos')}
                            ${this.crearFilaCard('📈', this.formatearGuaranies(gananciaNeta), 'Ganancia Neta', gananciaNeta >= 0 ? 'success' : 'danger')}
                            ${viaje.transportista_nombre ? this.crearFilaCard('🚚', viaje.transportista_nombre, 'Transportista') : ''}
                            ${viaje.transportista_telefono ? this.crearFilaCard('📞', viaje.transportista_telefono, 'Teléfono') : ''}
                            ${viaje.vehiculo ? this.crearFilaCard('🚛', viaje.vehiculo, 'Vehículo') : ''}
                        </div>
                        ${viaje.id_transportista ? `
                            <div class="card-actions">
                                <button class="btn btn-outline" onclick="panelEmpresas.iniciarChatConTransportista(${viaje.id_transportista}, '${(viaje.transportista_nombre || 'Transportista').replace(/'/g, "\\'")}')">
                                    <i class="fas fa-comments"></i> Chat con Transportista
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            })
        );
    }

    crearFilaCard(icono, texto, label = '', tipo = '') {
        if (!texto) return '';
        
        let claseColor = '';
        if (tipo === 'success') claseColor = 'style="color: #059669;"';
        if (tipo === 'danger') claseColor = 'style="color: #dc2626;"';
        if (tipo === 'warning') claseColor = 'style="color: #d97706;"';
        
        return `
            <div class="card-row">
                <span class="card-icon">${icono}</span>
                ${label ? `<strong>${label}:</strong>` : ''}
                <span ${claseColor}>${texto}</span>
            </div>
        `;
    }

    async filtrarViajes() {
        try {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const statusFilter = document.getElementById('statusFilter').value;
            const dateFilter = document.getElementById('dateFilter').value;
            
            if (!this.viajes || this.viajes.length === 0) {
                return;
            }

            let viajesFiltrados = this.viajes.filter(viaje => {
                let coincide = true;
                
                if (searchTerm) {
                    const term = searchTerm.toLowerCase();
                    coincide = coincide && (
                        (viaje.id_envio && viaje.id_envio.toString().includes(term)) ||
                        (viaje.descripcion && viaje.descripcion.toLowerCase().includes(term)) ||
                        (viaje.direccion_destino && viaje.direccion_destino.toLowerCase().includes(term)) ||
                        (viaje.direccion_origen && viaje.direccion_origen.toLowerCase().includes(term)) ||
                        (viaje.transportista_nombre && viaje.transportista_nombre.toLowerCase().includes(term))
                    );
                }
                
                if (statusFilter) {
                    coincide = coincide && viaje.estado === statusFilter;
                }
                
                if (dateFilter) {
                    const fechaViaje = viaje.fecha_envio ? new Date(viaje.fecha_envio).toISOString().split('T')[0] : '';
                    coincide = coincide && fechaViaje === dateFilter;
                }
                
                return coincide;
            });

            await this.mostrarViajesConGastos(viajesFiltrados);
            
        } catch (error) {
            console.error('❌ Error filtrando viajes:', error);
            this.mostrarError('Error al aplicar filtros');
        }
    }

    async cargarMetricas() {
        try {
            const token = localStorage.getItem('adminToken');
            if (!token) {
                await this.calcularMetricasLocales();
                return;
            }

            const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/metricas`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.metricas) {
                    await this.calcularMetricasLocales();
                    return;
                }
            }
            
            await this.calcularMetricasLocales();
            
        } catch (error) {
            console.error('❌ Error cargando métricas:', error);
            await this.calcularMetricasLocales();
        }
    }

    calcularTransportistasLibres() {
        if (!this.transportistas || this.transportistas.length === 0) return 0;
        
        const libres = this.transportistas.filter(t => 
            t.estado && t.estado.toLowerCase() === 'libre'
        ).length;
        
        return libres;
    }

  async calcularIngresosReales() {
    try {
        if (!this.viajes || this.viajes.length === 0) {
            return { 
                ingresosBrutos: 0, 
                ingresosNetosEmpresa: 0,
                pagoTransportistas: 0,
                gastosTotales: 0 
            };
        }
        
        const viajesEntregados = this.viajes.filter(v => v.estado === 'ENTREGADO');
        
        if (viajesEntregados.length === 0) {
            return { 
                ingresosBrutos: 0, 
                ingresosNetosEmpresa: 0,
                pagoTransportistas: 0,
                gastosTotales: 0 
            };
        }

        const idsEnvios = viajesEntregados.map(v => v.id_envio).filter(Boolean);
        let gastosDetallados = {};
        
        if (idsEnvios.length > 0) {
            gastosDetallados = await this.cargarGastosDetalladosPorEnvios(idsEnvios);
        }
        
        let ingresosBrutosTotal = 0;
        let pagoTransportistasTotal = 0;
        let gastosTotales = 0;
        
        viajesEntregados.forEach(viaje => {
            const ingresoBruto = parseFloat(viaje.costo) || 0;
            ingresosBrutosTotal += ingresoBruto;
            const pagoTransportista = ingresoBruto * 0.3;
            pagoTransportistasTotal += pagoTransportista;
            let gastosViaje = 0;
            if (gastosDetallados[viaje.id_envio]) {
                gastosViaje = gastosDetallados[viaje.id_envio].reduce((sum, gasto) => {
                    return sum + (parseFloat(gasto.monto) || 0);
                }, 0);
            }
            gastosTotales += gastosViaje;
        });
        
        const ingresoNetoEmpresa = (ingresosBrutosTotal * 0.7) - gastosTotales;
        
        return { 
            ingresosBrutos: ingresosBrutosTotal, 
            ingresosNetosEmpresa: ingresoNetoEmpresa,
            pagoTransportistas: pagoTransportistasTotal,
            gastosTotales: gastosTotales
        };
        
    } catch (error) {
        console.error('❌ Error calculando ingresos:', error);
        return { 
            ingresosBrutos: 0, 
            ingresosNetosEmpresa: 0,
            pagoTransportistas: 0,
            gastosTotales: 0 
        };
    }
}

async calcularMetricasLocales() {
    const transportistasLibres = this.calcularTransportistasLibres();
    const { 
        ingresosBrutos, 
        ingresosNetosEmpresa,
        pagoTransportistas,
        gastosTotales 
    } = await this.calcularIngresosReales();
    
    const viajesActivos = this.viajes ? this.viajes.filter(v => {
        const estado = v.estado?.toUpperCase();
        return estado === 'EN CAMINO';
    }).length : 0;

    this.actualizarMetricasUI({
        transportistasLibres,
        viajesActivos,
        ingresosBrutos,
        ingresosNetosEmpresa,
        pagoTransportistas,
        gastosTotales
    });
}

actualizarMetricasUI({ 
    transportistasLibres, 
    viajesActivos, 
    ingresosBrutos, 
    ingresosNetosEmpresa,
    pagoTransportistas,
    gastosTotales 
}) {
    document.getElementById('freeCarriers').textContent = transportistasLibres;
    document.getElementById('activeTrips').textContent = viajesActivos;
    document.getElementById('pendingTrips').textContent = this.viajes ? this.viajes.filter(v => v.estado === 'PENDIENTE').length : 0;
    
    document.getElementById('grossRevenue').textContent = this.formatearGuaranies(ingresosBrutos);
    
    const gastosFijosEl = document.getElementById('gastosFijosResumen');
    let gastosFijos = 0;
    if (gastosFijosEl) {
        const texto = gastosFijosEl.textContent;
        gastosFijos = parseInt(texto.replace(/[^0-9]/g, '')) || 0;
    }
    
    const utilidadReal = ingresosNetosEmpresa - gastosFijos;
    document.getElementById('totalRevenue').textContent = this.formatearGuaranies(utilidadReal);
    
    const utilidadElement = document.getElementById('totalRevenue');
    if (utilidadElement) {
        utilidadElement.style.color = utilidadReal >= 0 ? '#059669' : '#dc2626';
    }
}

    conectarWebSocket() {
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            console.error('❌ No hay token para conectar WebSocket');
            return;
        }

        console.log('🔌 Conectando WebSocket con token:', token.substring(0, 20) + '...');
        
        this.socket = io('http://localhost:3000', {
            auth: { 
                token: token 
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });

        this.socket.on('connect', () => {
            console.log('Conectado al servidor WebSocket - ID:', this.socket.id);
            
            if (this.ID_EMPRESA) {
                this.socket.emit('unirse-empresa-tracking', this.ID_EMPRESA);
                console.log(`🏢 Empresa ${this.ID_EMPRESA} unida a sala de tracking`);
                this.socket.emit('join-chats-empresa', { empresaId: this.ID_EMPRESA });
                console.log(`💬 Empresa ${this.ID_EMPRESA} unida a sala de chats general`);
            }
        });
this.socket.on('nuevo-mensaje', (data) => {
    console.log('💬💬💬 NUEVO MENSAJE RECIBIDO VÍA WEBSOCKET:', {
        chatId: data.chatId,
        remitente: data.remitente_tipo,
        transportistaId: data.transportistaId,  
        transportistaNombre: data.transportistaNombre,  
        mensaje: data.mensaje?.substring(0, 30) + '...',
        timestamp: data.timestamp
    });
    
    if (data.remitente_tipo === 'empresa') {
        console.log('✅ Mensaje propio (de la empresa), ignorando...');
        return;
    }
    
    const mensajesContainer = document.getElementById('mensajesContainer');
    if (mensajesContainer) {
        let esDuplicado = false;
        const misMensajes = mensajesContainer.querySelectorAll('.mensaje-empresa');
        const ultimosMensajes = Array.from(misMensajes).slice(-3);
        
        for (let mensajeDiv of ultimosMensajes) {
            const texto = mensajeDiv.textContent || '';
            if (texto.includes(data.mensaje)) {
                console.log('⚠️ Este mensaje ya lo envié yo:', data.mensaje?.substring(0, 30));
                esDuplicado = true;
                break;
            }
        }
        
        if (esDuplicado) {
            return; 
        }
    }
    
    if (data.chatId && data.chatId == this.chatIdActual) {
        console.log('✅ Mensaje REAL del transportista, mostrando...');
        
        const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
        this.agregarMensajeChat('transportista', data.mensaje, timestamp);
        
        setTimeout(() => {
            this.marcarMensajesComoLeidos();
        }, 1000);
    }
    
    if (data.remitente_tipo === 'transportista' && data.chatId != this.chatIdActual) {
        console.log('🔔 Nuevo mensaje en chat no abierto, incrementando contador');
        
        let contador = parseInt(localStorage.getItem('unreadCount') || '0');
        contador++;
        localStorage.setItem('unreadCount', contador);
        
        let nombreTransportista = 'Transportista';
        
        if (data.transportistaNombre) {
            nombreTransportista = data.transportistaNombre;
            console.log(`✅ Nombre obtenido de data: ${nombreTransportista}`);
        }
        else if (data.transportistaId) {
            const transportista = this.transportistas.find(t => 
                t.id_transportista == data.transportistaId
            );
            if (transportista && transportista.nombre) {
                nombreTransportista = transportista.nombre;
                console.log(`✅ Nombre encontrado localmente: ${nombreTransportista}`);
            } else {
                console.log(`⚠️ Transportista ID ${data.transportistaId} no encontrado localmente`);
            }
        }
        else {
            console.log('⚠️ No hay información del transportista en el mensaje');
        }
        
        localStorage.setItem('lastTransportista', nombreTransportista);
        
        this.actualizarContadorEmpresa(contador, nombreTransportista);
        
        this.actualizarTituloPestana(contador, nombreTransportista);
        
        this.mostrarNotificacionConNombre(nombreTransportista, data.mensaje);
    }
});


        this.socket.on('confirmacion-mensaje-empresa', (data) => {
            console.log('✅ Confirmación de mensaje enviado:', {
                chatId: data.chatId,
                mensajeId: data.mensajeId,
                confirmado: data.confirmado
            });
        });
        this.socket.on('error-chat', (data) => {
            console.error('❌ Error en chat:', data);
            if (data.remitente_tipo === 'empresa') {
                this.mostrarError('Error al enviar mensaje');
            }
        });
        this.socket.on('mensajes-leidos', (data) => {
            console.log(`📖 Mensajes marcados como leídos en chat ${data.chatId} por ${data.leido_por}`);
            
            if (data.chatId == this.chatIdActual && data.leido_por === 'transportista') {
                console.log('✅ El transportista leyó tus mensajes');
            }
        });
        this.socket.on('ubicacion-actualizada', (data) => {
            console.log('📍📍📍 NUEVA UBICACIÓN RECIBIDA:', {
                transportista: data.transportistaId,
                nombre: data.transportistaNombre,
                latitud: data.latitud,
                longitud: data.longitud,
                envio: data.envioId,
                etapa: data.etapa
            });
            
            if (data.empresaId != this.ID_EMPRESA) {
                console.log('⚠️ Ubicación de otra empresa, ignorando');
                return;
            }
            this.procesarUbicacionEnTiempoReal(data);
            if (data.envioId && data.latitud && data.longitud) {
                this.actualizarRuta(data.transportistaId, {
                    latitud: parseFloat(data.latitud),
                    longitud: parseFloat(data.longitud),
                    fecha: new Date(),
                    tipo: 'REAL'
                });
                this.actualizarRutaHistorica(data.transportistaId, {
                    lat: parseFloat(data.latitud),
                    lng: parseFloat(data.longitud),
                    timestamp: new Date()
                });
            }
            if (document.getElementById('seccion-tracking')?.classList.contains('active')) {
                this.actualizarTransportistaEnLista(data);
            }
        });

        this.socket.on('transportista-en-viaje', (data) => {
            console.log('🚀 Transportista inició viaje vía WebSocket:', data);
            
            if (data.empresaId == this.ID_EMPRESA) {
                this.agregarTransportistaActivo(data);
                this.mostrarNotificacion(`Transportista ${data.transportistaNombre} inició un viaje`);
            }
        });

        this.socket.on('transportista-viaje-completado', (data) => {
            console.log('✅ Transportista completó viaje vía WebSocket:', data);
            
            if (data.empresaId == this.ID_EMPRESA) {
                this.removerTransportistaActivo(data.transportistaId);
                this.mostrarNotificacion(`Transportista completó el envío ${data.envioId}`);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Error de conexión WebSocket:', error.message);
            
            setTimeout(() => {
                if (this.socket && !this.socket.connected) {
                    console.log('🔄 Intentando reconexión con polling...');
                    this.socket.io.opts.transports = ['polling'];
                }
            }, 2000);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Desconectado del WebSocket:', reason);
            
            if (reason === 'io server disconnect') {
                setTimeout(() => {
                    this.socket.connect();
                }, 3000);
            }
        });

        setTimeout(() => {
            if (this.socket && this.socket.connected && this.ID_EMPRESA) {
                this.socket.emit('verificar-tracking-empresa', this.ID_EMPRESA);
            }
        }, 2000);

    } catch (error) {
        console.error('❌ Error crítico conectando WebSocket:', error);
    }
}

procesarUbicacionEnTiempoReal(data) {
    const { transportistaId, latitud, longitud, envioId } = data;
    
    const viajeIndex = this.viajesActivos.findIndex(v => 
        v.transportista && v.transportista.id == transportistaId
    );
    
    if (viajeIndex !== -1) {
        this.viajesActivos[viajeIndex].ubicacion = {
            latitud: parseFloat(latitud),
            longitud: parseFloat(longitud),
            fecha: new Date(),
            tipo: 'REAL',
            esReal: true
        };
        
        this.actualizarMarcadorEnMapa(transportistaId, latitud, longitud);
        
        const markerKey = `viaje_${transportistaId}`;
        const marker = this.marcadores[markerKey] || this.marcadores[transportistaId];
        
        if (marker) {
            marker.setLatLng([latitud, longitud]);
        }
        
    } else {
        console.log(`⚠️ Transportista ${transportistaId} no encontrado en viajes activos`);
        
        setTimeout(() => {
            this.cargarTracking();
        }, 1000);
    }
}
actualizarMarcadorEnMapa(transportistaId, latitud, longitud) {
    if (!this.mapa) return;
    this.actualizarRutaHistorica(transportistaId, {
        lat: parseFloat(latitud),
        lng: parseFloat(longitud),
        timestamp: new Date()
    });
    const markerKey = `viaje_${transportistaId}`;
    const marker = this.marcadores[markerKey] || this.marcadores[transportistaId];
    
    if (marker) {
        marker.setLatLng([latitud, longitud]);
    }
    
    console.log(`📍 Punto agregado a línea: ${transportistaId}`);
}
actualizarHoraPopup(transportistaId) {
    const markerKey = `viaje_${transportistaId}`;
    const marker = this.marcadores[markerKey] || this.marcadores[transportistaId];
    
    if (marker && marker.getPopup()) {
        const nuevaHora = new Date().toLocaleTimeString('es-PY');
        const popupContent = marker.getPopup().getContent();
        const nuevoContenido = popupContent.replace(
            /(\d{2}:\d{2}:\d{2})/g,
            nuevaHora
        );
        
        marker.getPopup().setContent(nuevoContenido);
    }
}

actualizarPopupSiAbierto(transportistaId, nuevaPosicion) {
    const popups = this.mapa._popups;
    
    if (popups && popups.length > 0) {
        popups.forEach(popup => {
            const popupContent = popup._content;
            if (popupContent && popupContent.includes(transportistaId.toString())) {
                popup.setLatLng(nuevaPosicion);
                const nuevaHora = new Date().toLocaleTimeString('es-PY');
                const nuevoContenido = popupContent.replace(
                    /(\d{2}:\d{2}:\d{2})/g,
                    nuevaHora
                );
                popup.setContent(nuevoContenido);
                
                console.log(`Popup actualizado para transportista ${transportistaId}`);
            }
        });
    }
}

    agregarTransportistaActivo(data) {
        const { transportistaId, envioId, transportistaInfo } = data;
        
        const existe = this.viajesActivos.some(v => v.transportista.id === transportistaId);
        if (!existe) {
            this.cargarTracking();
        }
    }

    removerTransportistaActivo(transportistaId) {
        this.limpiarRuta(transportistaId);
        this.limpiarRutaHistorica(transportistaId);
        
        this.viajesActivos = this.viajesActivos.filter(v => 
            v.transportista.id !== transportistaId
        );
        
        if (this.marcadores[transportistaId]) {
            this.mapa.removeLayer(this.marcadores[transportistaId]);
            delete this.marcadores[transportistaId];
        }
        
        const markerKey = `viaje_${transportistaId}`;
        if (this.marcadores[markerKey]) {
            this.mapa.removeLayer(this.marcadores[markerKey]);
            delete this.marcadores[markerKey];
        }
        
        this.actualizarVistaTracking();
    }

    unirAchat(chatId) {
        if (this.socket && chatId) {
            this.socket.emit('join-chat', { chatId: chatId });
        }
    }

    async marcarMensajesComoLeidos() {
        if (!this.chatIdActual) return;
        
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${this.CHAT_URL}/chats/${this.chatIdActual}/mensajes/leer`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    remitente_tipo: 'empresa'
                })
            });

            if (response.ok) {
                console.log('Mensajes marcados como leídos');
            }
        } catch (error) {
            console.error('Error marcando mensajes como leídos:', error);
        }
    }

    async configurarChat() {
        this.limpiarChat();
        
        const chatHeader = document.getElementById('chatHeader');
        const inputContainer = document.getElementById('inputChatContainer');
        const mensajesContainer = document.getElementById('mensajesContainer');
        
        if (chatHeader) chatHeader.style.display = 'none';
        if (inputContainer) inputContainer.style.display = 'none';
        if (mensajesContainer) mensajesContainer.classList.remove('chat-activo');
        
        await this.cargarTransportistasParaChat();
    }

    async cargarTransportistasParaChat() {
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            throw new Error('No hay token de autenticación');
        }
        const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/transportistas?simple=true`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const transportistas = data.success ? data.transportistas : [];
        transportistas.sort((a, b) => {
            const nombreA = (a.nombre || '').toUpperCase();
            const nombreB = (b.nombre || '').toUpperCase();
            
            if (nombreA < nombreB) {
                return -1;
            }
            if (nombreA > nombreB) {
                return 1;
            }
            return 0;
        });
        
        const listaContainer = document.getElementById('listaTransportistasChat');
        if (!listaContainer) {
            return;
        }
        
        if (!transportistas || transportistas.length === 0) {
            listaContainer.innerHTML = this.crearEstadoVacio('No hay transportistas disponibles para chat');
            return;
        }

        listaContainer.innerHTML = transportistas.map(t => {
            const estaLibre = t.estado && t.estado.toLowerCase() === 'libre';
            const colorPunto = estaLibre ? '#22c55e' : '#f59e0b';
            const textoEstado = estaLibre ? '🟢 Disponible' : '🟡 Ocupado';
            const claseItem = estaLibre ? 'libre' : 'ocupado';
            
            return `
                <div class="transportista-item ${claseItem}" 
                     onclick="panelEmpresas.seleccionarTransportistaChat(this, ${t.id_transportista}, '${(t.nombre || 'Transportista').replace(/'/g, "\\'")}', '${t.estado || 'Libre'}')">
                    <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${colorPunto};"></div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #1e293b;">${t.nombre || 'Transportista'}</div>
                            <div style="font-size: 0.85em; color: #64748b;">
                                ${textoEstado} • ${t.vehiculo || 'Sin vehículo'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error cargando transportistas para chat:', error);
        const listaContainer = document.getElementById('listaTransportistasChat');
        if (listaContainer) {
            listaContainer.innerHTML = this.crearEstadoError('Error cargando transportistas');
        }
    }
}

    async iniciarChatConTransportista(transportistaId, nombreTransportista) {
        try {
            this.abrirSeccion('chat');
            
            setTimeout(async () => {
                await this.cargarTransportistasParaChat();
                
                const transportistaItems = document.querySelectorAll('.transportista-item');
                let encontrado = false;
                
                transportistaItems.forEach(item => {
                    if (item.textContent.includes(nombreTransportista)) {
                        this.seleccionarTransportistaChat(item, transportistaId, nombreTransportista, 'Libre');
                        encontrado = true;
                    }
                });
                
                if (!encontrado) {
                    await this.seleccionarTransportistaChatManual(transportistaId, nombreTransportista);
                }
            }, 500);
        } catch (error) {
            console.error('❌ Error iniciando chat:', error);
        }
    }

    async seleccionarTransportistaChatManual(transportistaId, nombreTransportista) {
        const listaContainer = document.getElementById('listaTransportistasChat');
        if (!listaContainer) return;

        const tempItem = document.createElement('div');
        tempItem.className = 'transportista-item active';
        tempItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1e293b;">${nombreTransportista}</div>
                    <div style="font-size: 0.85em; color: #64748b;">🟢 Disponible</div>
                </div>
            </div>
        `;
        
        listaContainer.appendChild(tempItem);
        
        this.transportistaChatSeleccionado = { 
            id: transportistaId, 
            nombre: nombreTransportista,
            estado: 'Libre'
        };
        
        const chatHeader = document.getElementById('chatHeader');
        const chatHeaderNombre = document.getElementById('chatHeaderNombre');
        const chatHeaderEstado = document.getElementById('chatHeaderEstado');
        
        if (chatHeader) {
            chatHeader.style.display = 'flex';
            chatHeader.classList.add('chat-activo');
        }
        
        if (chatHeaderNombre) chatHeaderNombre.textContent = nombreTransportista;
        if (chatHeaderEstado) chatHeaderEstado.textContent = '🟢 Disponible';
        
        const inputContainer = document.getElementById('inputChatContainer');
        const inputChat = document.getElementById('inputMensaje');
        const btnEnviar = document.getElementById('btnEnviarMensaje');
        
        if (inputContainer) {
            inputContainer.style.display = 'block';
            inputContainer.classList.add('chat-activo');
        }
        
        if (inputChat) {
            inputChat.disabled = false;
            inputChat.focus();
        }
        if (btnEnviar) btnEnviar.disabled = false;
        
        const mensajesContainer = document.getElementById('mensajesContainer');
        if (mensajesContainer) {
            mensajesContainer.classList.add('chat-activo');
        }
        
        await this.crearOUnirseAlChat(transportistaId);
        await this.cargarHistorialChat();
    }

    async seleccionarTransportistaChat(elemento, transportistaId, nombre, estado) {
    try {
        document.querySelectorAll('.transportista-item').forEach(item => {
            item.classList.remove('active');
        });
        
        elemento.classList.add('active');
        
        this.transportistaChatSeleccionado = { 
            id: transportistaId, 
            nombre: nombre,
            estado: estado
        };
        
        const estaLibre = estado && estado.toLowerCase() === 'libre';
        const textoEstado = estaLibre ? '🟢 Disponible' : '🟡 Ocupado';
        
        const chatHeader = document.getElementById('chatHeader');
        const chatHeaderNombre = document.getElementById('chatHeaderNombre');
        const chatHeaderEstado = document.getElementById('chatHeaderEstado');
        
        if (chatHeader) {
            chatHeader.style.display = 'flex';
            chatHeader.classList.add('chat-activo');
        }
        
        if (chatHeaderNombre) chatHeaderNombre.textContent = nombre;
        if (chatHeaderEstado) chatHeaderEstado.textContent = textoEstado;
        
        const inputContainer = document.getElementById('inputChatContainer');
        const inputChat = document.getElementById('inputMensaje');
        const btnEnviar = document.getElementById('btnEnviarMensaje');
        
        if (inputContainer) {
            inputContainer.style.display = 'block';
            inputContainer.classList.add('chat-activo');
        }
        
        if (inputChat) {
            inputChat.disabled = false;
            inputChat.focus();
        }
        if (btnEnviar) btnEnviar.disabled = false;
        
        const mensajesContainer = document.getElementById('mensajesContainer');
        if (mensajesContainer) {
            mensajesContainer.classList.add('chat-activo');
        }
        
        await this.crearOUnirseAlChat(transportistaId);
        await this.cargarHistorialChat();
        
        localStorage.setItem('unreadCount', '0');
        this.actualizarContadorEmpresa(0);
        this.actualizarTituloPestana(0);
        
    } catch (error) {
        console.error('Error seleccionando transportista:', error);
        this.mostrarError('Error al seleccionar transportista: ' + error.message);
    }
}

    async crearOUnirseAlChat(transportistaId) {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${this.CHAT_URL}/chats/crear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    transportista_id: transportistaId
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.chatIdActual = data.chat?.id || data.id;
                
                if (this.socket && this.chatIdActual) {
                    this.unirAchat(this.chatIdActual);
                }
            } else {
                await this.obtenerChatExistente(transportistaId);
            }
        } catch (error) {
            console.error('Error creando/uniéndose al chat:', error);
            await this.obtenerChatExistente(transportistaId);
        }
    }

    async obtenerChatExistente(transportistaId) {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${this.CHAT_URL}/chats/empresa/${this.ID_EMPRESA}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const chats = data.chats || [];
                
                const chatExistente = chats.find(chat => chat.transportista_id == transportistaId);
                
                if (chatExistente) {
                    this.chatIdActual = chatExistente.id;
                    
                    if (this.socket) {
                        this.unirAchat(this.chatIdActual);
                    }
                }
            }
        } catch (error) {
            console.error('Error buscando chat existente:', error);
        }
    }

    async cargarHistorialChat() {
        if (!this.chatIdActual) {
            this.limpiarChat();
            return;
        }

        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${this.CHAT_URL}/chats/${this.chatIdActual}/mensajes`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const mensajes = data.mensajes || [];
                this.mostrarHistorialChat(mensajes);
            } else {
                this.limpiarChat();
            }
        } catch (error) {
            console.error('❌ Error cargando historial del chat:', error);
            this.limpiarChat();
        }
    }

    mostrarHistorialChat(mensajes) {
        const mensajesContainer = document.getElementById('mensajesContainer');
        
        if (!mensajesContainer) {
            return;
        }
        
        if (!mensajes || mensajes.length === 0) {
            mensajesContainer.innerHTML = `
                <div class="estado-vacio">
                    <i class="fas fa-comments"></i>
                    <p>No hay mensajes aún</p>
                    <small>Envía el primer mensaje para comenzar la conversación</small>
                </div>
            `;
            return;
        }

        mensajesContainer.innerHTML = mensajes.map(mensaje => {
            const esEmpresa = mensaje.remitente === 'empresa' || mensaje.remitente_tipo === 'empresa';
            const fecha = new Date(mensaje.enviado_en);
            const hora = fecha.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
            const nombreRemitente = esEmpresa ? 'Tú' : this.transportistaChatSeleccionado?.nombre || 'Transportista';
            
            return `
                <div class="mensaje ${esEmpresa ? 'mensaje-empresa' : 'mensaje-transportista'}">
                    <div style="font-size: 0.85em; color: #e4e4e4ff; margin-bottom: 4px;">
                        ${nombreRemitente} - ${hora}
                    </div>
                    <div>${mensaje.mensaje}</div>
                </div>
            `;
        }).join('');

        this.scrollAlFinalChat();
    }

    limpiarChat() {
        const mensajesContainer = document.getElementById('mensajesContainer');
        
        if (mensajesContainer) {
            mensajesContainer.classList.remove('chat-activo');
        }
        
        const chatHeader = document.getElementById('chatHeader');
        if (chatHeader) {
            chatHeader.style.display = 'none';
            chatHeader.classList.remove('chat-activo');
        }
        
        const inputContainer = document.getElementById('inputChatContainer');
        if (inputContainer) {
            inputContainer.style.display = 'none';
            inputContainer.classList.remove('chat-activo');
        }
        
        const inputChat = document.getElementById('inputMensaje');
        const btnEnviar = document.getElementById('btnEnviarMensaje');
        if (inputChat) {
            inputChat.disabled = true;
            inputChat.value = '';
        }
        if (btnEnviar) btnEnviar.disabled = true;
        
        this.transportistaChatSeleccionado = null;
        this.chatIdActual = null;
        
        if (mensajesContainer) {
            mensajesContainer.innerHTML = `
                <div class="estado-vacio">
                    <i class="fas fa-comments"></i>
                    <p>Selecciona un transportista para comenzar a chatear</p>
                    <small>Los mensajes aparecerán aquí</small>
                </div>
            `;
        }
        
        document.querySelectorAll('.transportista-item').forEach(item => {
            item.classList.remove('active');
        });
    }

    scrollAlFinalChat() {
        const mensajesContainer = document.getElementById('mensajesContainer');
        mensajesContainer.scrollTop = mensajesContainer.scrollHeight;
    }

async enviarMensajeChat() {
    const input = document.getElementById('inputMensaje');
    const mensaje = input?.value.trim();
    
    if (!mensaje) {
        alert('Escribe un mensaje');
        return;
    }
    
    if (!this.transportistaChatSeleccionado) {
        alert('Selecciona un transportista primero');
        return;
    }
    
    if (!this.chatIdActual) {
        alert('No hay un chat activo');
        return;
    }
    
    try {
        this.agregarMensajeLocal('empresa', mensaje);
        
        if (input) input.value = '';
        
        if (!this.socket || !this.socket.connected) {
            this.conectarWebSocket();
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (this.socket && this.socket.connected) {
            console.log('📤 Enviando mensaje por WebSocket:', {
                chatId: this.chatIdActual,
                mensaje: mensaje,
                remitente_tipo: 'empresa'
            });
            
            this.socket.emit('enviar-mensaje-chat', {
                chatId: this.chatIdActual,
                mensaje: mensaje,
                remitente_tipo: 'empresa',  
                timestamp: new Date().toISOString()
            });
            
            console.log('✅ Mensaje enviado por WebSocket');
        } else {
            throw new Error('WebSocket no conectado');
        }
        
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        this.mostrarError('No se pudo enviar el mensaje: ' + error.message);
        this.mostrarErrorMensaje();
    }
}

    mostrarErrorMensaje() {
        const mensajesContainer = document.getElementById('mensajesContainer');
        const errorHTML = `
            <div class="mensaje mensaje-error" style="align-self: center; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;">
                <div style="font-size: 0.85em;">
                     Error al enviar el mensaje. Intenta nuevamente.
                </div>
            </div>
        `;
        
        mensajesContainer.innerHTML += errorHTML;
        this.scrollAlFinalChat();
        
        setTimeout(() => {
            const errorMsg = mensajesContainer.querySelector('.mensaje-error');
            if (errorMsg) {
                errorMsg.remove();
            }
        }, 3000);
    }

    agregarMensajeLocal(remitente, mensaje, timestamp = new Date()) {
        const mensajesContainer = document.getElementById('mensajesContainer');
        
        const estadoVacio = mensajesContainer.querySelector('.estado-vacio');
        if (estadoVacio) {
            estadoVacio.remove();
        }
        
        if (!mensajesContainer.classList.contains('chat-activo')) {
            mensajesContainer.classList.add('chat-activo');
        }

        const hora = timestamp.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
        const nombreRemitente = remitente === 'empresa' ? 'Tú' : this.transportistaChatSeleccionado?.nombre || 'Transportista';
        
        const mensajeHTML = `
            <div class="mensaje ${remitente === 'empresa' ? 'mensaje-empresa' : 'mensaje-transportista'}">
                <div style="font-size: 0.85em; color: ${remitente === 'empresa' ? '#e4e4e4ff' : '#e4e4e4ff'}; margin-bottom: 4px;">
                    ${nombreRemitente} - ${hora}
                </div>
                <div>${mensaje}</div>
            </div>
        `;
        
        mensajesContainer.innerHTML += mensajeHTML;
        this.scrollAlFinalChat();
    }

    agregarMensajeChat(remitente, mensaje, timestamp) {
        this.agregarMensajeLocal(remitente, mensaje, timestamp);
        
        if (remitente === 'transportista') {
            this.marcarMensajesComoLeidos();
        }
    }

    abrirSeccion(seccion) {
        document.querySelectorAll('.tab-content').forEach(sec => {
            sec.classList.remove('active');
        });
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const seccionElement = document.getElementById(`seccion-${seccion}`);
        if (seccionElement) {
            seccionElement.classList.add('active');
        }
        
        const navItem = document.querySelector(`.nav-item[data-seccion="${seccion}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        this.actualizarTituloHeader(seccion);
        
        if (seccion === 'reportes') {
            this.cargarViajesConGastosParaReportes();
        } else if (seccion === 'chat') {
            this.configurarChat();
        } else if (seccion === 'tracking') {
            this.inicializarTracking();
        }
    }

    actualizarTituloHeader(seccion) {
        const titulos = {
            'dashboard': 'Panel de Control',
            'reportes': 'Reportes y Estadísticas', 
            'chat': 'Chat con Transportistas',
            'tracking': 'Seguimiento en Vivo'
        };
        
        const subtitulos = {
            'dashboard': 'Gestión integral de logística y transportes',
            'reportes': 'Análisis y seguimiento de operaciones',
            'chat': 'Comunicación en tiempo real',
            'tracking': 'Monitoreo de transportistas en tiempo real'
        };
        
        const pageTitle = document.querySelector('.page-title h1');
        const pageSubtitle = document.querySelector('.page-title .subtitle');
        
        if (pageTitle) pageTitle.textContent = titulos[seccion] || 'Panel de Control';
        if (pageSubtitle) pageSubtitle.textContent = subtitulos[seccion] || 'Gestión integral de logística y transportes';
    }

    async inicializarTracking() {
        try {
            this.agregarEstilosMapa();
            await this.inicializarMapa();
            await this.cargarTracking();
            this.iniciarActualizacionAutomatica();
            this.agregarControlesRutas();
        } catch (error) {
            console.error('❌ Error inicializando tracking:', error);
        }
    }

    iniciarActualizacionAutomatica() {
        if (this.intervaloTracking) {
            clearInterval(this.intervaloTracking);
        }

        this.intervaloTracking = setInterval(() => {
            this.cargarTracking();
        }, 5000);
    }

async cargarTracking() {
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            throw new Error('No hay token de autenticación');
        }

        await this.cargarUbicacionEmpresa();

        const viajesResponse = await fetch(`${this.BASE_URL}/tracking/empresa/${this.ID_EMPRESA}/transportistas-en-viaje`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        this.viajesActivos = [];
        if (viajesResponse.ok) {
            const viajesData = await viajesResponse.json();
            
            if (viajesData.success && viajesData.transportistas) {
                console.log('✅ Transportistas en viaje recibidos:', viajesData.transportistas);
                
                this.viajesActivos = viajesData.transportistas.map(t => ({
                    transportista: {
                        id: t.transportista.id,
                        nombre: t.transportista.nombre,
                        telefono: t.transportista.telefono,
                        vehiculo: t.transportista.vehiculo,
                        estado: t.transportista.estado,
                        tipo_icono: this.obtenerTipoIcono(t.transportista.vehiculo)
                    },
                    ubicacion: {
                        latitud: parseFloat(t.ubicacion.latitud),
                        longitud: parseFloat(t.ubicacion.longitud),
                        fecha: t.ubicacion.fecha || new Date(),
                        tipo: 'REAL',
                        esReal: true
                    },
                    pedido_actual: {
                        id: t.pedido_actual.id,
                        direccion_origen: t.pedido_actual.origen,
                        direccion_destino: t.pedido_actual.destino,
                        descripcion: t.pedido_actual.descripcion,
                        estado: t.pedido_actual.estado
                    }
                }));
                
                console.log(`🚚 Viajes activos procesados: ${this.viajesActivos.length}`);
                this.viajesActivos.forEach((viaje, index) => {
                    if (viaje.transportista && viaje.ubicacion) {
                        this.crearMarcadorTransportistaViaje(viaje, index);
                    }
                });
            }
        }

        const transportistasResponse = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/transportistas`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        this.transportistasEnBase = [];
        if (transportistasResponse.ok) {
            const transportistasData = await transportistasResponse.json();
            
            if (transportistasData.success) {
                const transportistasDisponibles = transportistasData.transportistas.filter(t => {
                    return !this.viajesActivos.some(v => v.transportista.id === t.id_transportista);
                });

                console.log(`Transportistas disponibles: ${transportistasDisponibles.length}`);

                this.transportistasEnBase = transportistasDisponibles.map((t, index) => {
                    const radio = 0.0004;
                    const angulo = (index / transportistasDisponibles.length) * 2 * Math.PI;
                    
                    const latEmpresa = this.ubicacionEmpresa?.lat || -25.36150240;
                    const lngEmpresa = this.ubicacionEmpresa?.lng || -57.55890150;
                    
                    return {
                        transportista: {
                            id: t.id_transportista,
                            nombre: t.nombre,
                            telefono: t.telefono,
                            vehiculo: t.vehiculo,
                            estado: t.estado,
                            tipo_icono: this.obtenerTipoIcono(t.vehiculo)
                        },
                        ubicacion: {
                            latitud: latEmpresa + (Math.cos(angulo) * radio) + 0.0001,
                            longitud: lngEmpresa + (Math.sin(angulo) * radio),
                            fecha: new Date(),
                            tipo: 'BASE'
                        }
                    };
                });
            }
        }

        this.actualizarVistaTracking();
        this.actualizarMapa();
        
        console.log('✅ Tracking cargado:', {
            enViaje: this.viajesActivos.length,
            enBase: this.transportistasEnBase.length
        });
        
    } catch (error) {
        console.error('Error en cargarTracking:', error);
        this.mostrarError('Error cargando tracking: ' + error.message);
    }
}

    async cargarUbicacionEmpresa() {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.success && data.empresa) {
                    this.infoEmpresa = data.empresa;
                    
                    const lat = data.empresa.latitud || data.empresa.lat || data.empresa.latitude;
                    const lng = data.empresa.longitud || data.empresa.lng || data.empresa.longitude || data.empresa.lon;
                    
                    if (lat && lng) {
                        this.ubicacionEmpresa = {
                            lat: parseFloat(lat),
                            lng: parseFloat(lng)
                        };
                    } else {
                        this.ubicacionEmpresa = null;
                    }
                }
            }
        } catch (error) {
            console.error('Error:', error);
            this.ubicacionEmpresa = null;
        }
    }

    obtenerTipoIcono(vehiculo) {
        if (!vehiculo) return 'camion';
        return 'camion';
    }

    async inicializarMapa() {
        const mapaContainer = document.getElementById('mapa-tracking');
        if (!mapaContainer) {
            console.error('Contenedor del mapa no encontrado');
            return;
        }

        mapaContainer.innerHTML = '';
        
        if (this.mapa) {
            this.mapa.remove();
            this.mapa = null;
            this.marcadores = {};
            this.marcadorEmpresa = null;
        }

        try {
            if (!this.ubicacionEmpresa) {
                await this.cargarUbicacionEmpresa();
            }

            const centroMapa = this.ubicacionEmpresa || { lat: -25.3005, lng: -57.6362 };

            this.mapa = L.map('mapa-tracking', {
                zoomControl: true,
                scrollWheelZoom: true,
                doubleClickZoom: true,
                boxZoom: true,
                keyboard: true,
                dragging: true,
                zoomSnap: 0.1,
                zoomDelta: 0.5
            }).setView([centroMapa.lat, centroMapa.lng], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: false,
                maxZoom: 18,
                minZoom: 10
            }).addTo(this.mapa);

            this.marcadores = {};
            this.marcadorEmpresa = null;
            this.mapaCentrado = false;

            this.configurarControlesUsuario();

        } catch (error) {
            console.error('Error inicializando mapa:', error);
            mapaContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar el mapa: ${error.message}</p>
                </div>
            `;
        }
    }

    configurarControlesUsuario() {
        if (!this.mapa) return;
        
        this.mapa.on('movestart', () => {
            this.usuarioMoviendoMapa = true;
            
            if (this.timeoutControlManual) {
                clearTimeout(this.timeoutControlManual);
            }
        });

        this.mapa.on('moveend', () => {
            this.timeoutControlManual = setTimeout(() => {
                this.usuarioMoviendoMapa = false;
            }, 3000);
        });

        this.mapa.on('zoomstart', () => {
            this.usuarioMoviendoMapa = true;
            if (this.timeoutControlManual) {
                clearTimeout(this.timeoutControlManual);
            }
        });

        this.mapa.on('zoomend', () => {
            this.timeoutControlManual = setTimeout(() => {
                this.usuarioMoviendoMapa = false;
            }, 3000);
        });
    }

agregarEstilosMapa() {
    if (document.getElementById('mapa-estilos-dinamicos')) return;
    
    const styles = `
        .empresa-marker {
            z-index: 1000 !important;
        }
        
        .transportista-marker {
            animation: pulse 2s infinite;
        }
        
        /* ESTILOS PARA POPUPS */
        .popup-transportista .leaflet-popup-content-wrapper {
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            border: 2px solid #3b82f6;
            background: white;
        }
        
        .popup-transportista .leaflet-popup-content {
            margin: 8px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #1f2937;
        }
        
        .popup-transportista .leaflet-popup-tip {
            background: #3b82f6;
        }
        
        .custom-popup-base .leaflet-popup-content-wrapper {
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border: 2px solid #059669;
            background: white;
        }
        
        .custom-popup-base .leaflet-popup-content {
            margin: 12px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #1f2937;
        }
        
        .custom-popup-base .leaflet-popup-tip {
            background: #059669;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        .leaflet-control-zoom {
            border: none !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
        }
        
        .leaflet-control-zoom a {
            background: white !important;
            color: #333 !important;
            border: none !important;
            border-radius: 4px !important;
            margin: 2px !important;
        }
        
        .leaflet-control-zoom a:hover {
            background: #f8fafc !important;
        }
        
        /* Estilo para marcadores temporales */
        .temp-marker {
            z-index: 999 !important;
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.id = 'mapa-estilos-dinamicos';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}
    agregarControlesRutas() {
        const controlesDiv = document.createElement('div');
        controlesDiv.id = 'controles-rutas';
        controlesDiv.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            gap: 5px;
        `;
        
        controlesDiv.innerHTML = `
            <button onclick="panelEmpresas.mostrarTodasLasRutas()" 
                    style="padding: 8px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                Mostrar Rutas
            </button>
            <button onclick="panelEmpresas.ocultarTodasLasRutas()" 
                    style="padding: 8px 12px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                Ocultar Rutas
            </button>
            <button onclick="panelEmpresas.limpiarTodasLasRutas()" 
                    style="padding: 8px 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                Limpiar Rutas
            </button>
        `;
        
        const mapaContainer = document.getElementById('mapa-tracking');
        if (mapaContainer) {
            mapaContainer.appendChild(controlesDiv);
        }
    }
actualizarMapa() {
    if (!this.mapa) {
        this.inicializarMapa();
        return;
    }

    console.log('🗺️ Actualizando mapa');
    if (this.ubicacionEmpresa && this.ubicacionEmpresa.lat && this.ubicacionEmpresa.lng) {
        if (!this.marcadorEmpresa) {
            this.crearMarcadorEmpresa();
        }
    }
    if (this.transportistasEnBase && this.transportistasEnBase.length > 0) {
        this.transportistasEnBase.forEach((transportistaData, index) => {
            const transportistaId = transportistaData.transportista.id;
            const markerKey = `base_${transportistaId}`;
            
            if (!this.marcadores[markerKey]) {
                this.crearMarcadorTransportistaBase(transportistaData, index);
            }
        });
    }
    setTimeout(() => {
        if (!this.usuarioMoviendoMapa) {
            this.centrarMapaEnTodos();
        }
    }, 500);
}
crearMarcadorEmpresa() {
    if (!this.mapa || !this.ubicacionEmpresa) return;
    
    if (this.marcadorEmpresa) {
        this.mapa.removeLayer(this.marcadorEmpresa);
    }
    
    this.marcadorEmpresa = L.marker([this.ubicacionEmpresa.lat, this.ubicacionEmpresa.lng], {
        icon: L.divIcon({
            className: 'empresa-marker',
            html: `
                <div style="
                    background: #dc2626; 
                    color: white; 
                    border-radius: 50%; 
                    width: 60px; 
                    height: 60px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 24px;
                    border: 3px solid white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                " title="Base de Operaciones">
                    🏢
                </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 60]
        })
    }).addTo(this.mapa);
}

limpiarMarcadoresFantasma() {
    const idsActivos = new Set();
    if (this.transportistasEnBase) {
        this.transportistasEnBase.forEach(t => {
            if (t.transportista?.id) {
                idsActivos.add(`base_${t.transportista.id}`);
            }
        });
    }
    
    if (this.viajesActivos) {
        this.viajesActivos.forEach(v => {
            if (v.transportista?.id) {
                idsActivos.add(`viaje_${v.transportista.id}`);
            }
        });
    }
}
crearMarcadorTransportistaViaje(viaje, index) {
    try {
        const { transportista, ubicacion } = viaje;
        
        if (!transportista || !ubicacion || !this.mapa) {
            console.error('❌ Datos incompletos para crear marcador');
            return null;
        }
        
        console.log(`Creando marcador simple para ${transportista.nombre}`);
        
        const markerKey = `viaje_${transportista.id}`;
        if (this.marcadores[markerKey]) {
            console.log(`📍 Marcador ya existe para ${transportista.nombre}, actualizando posición`);
            const marker = this.marcadores[markerKey];
            marker.setLatLng([ubicacion.latitud, ubicacion.longitud]);
            
            return marker;
        }
        
        const marker = L.marker([ubicacion.latitud, ubicacion.longitud], {
            title: transportista.nombre,
            zIndexOffset: 1000,
            icon: L.divIcon({
                className: 'transportista-marker-mini',
                html: `
                    <div style="
                        width: 30px;
                        height: 30px;
                        background: #dc2626;
                        color: white;
                        border-radius: 50%;
                        border: 2px solid white;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        font-size: 12px;
                    " title="${transportista.nombre}">
                        ${this.obtenerIniciales(transportista.nombre)}
                    </div>
                `,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(this.mapa);
        
        this.marcadores[markerKey] = marker;
        this.marcadores[transportista.id] = marker;
        
        console.log(`📍 Marcador mini creado para ${transportista.nombre} con popup`);
        
        return marker;
        
    } catch (error) {
        console.error('❌ Error en crearMarcadorTransportistaViaje:', error);
        return null;
    }
}

posicionarPopupExterno(transportistaId, marker) {
    const popupData = this.popupsExternos?.[transportistaId];
    if (!popupData || !marker || !this.mapa) return;
    
    const popupElement = popupData.elemento;
    const latLng = marker.getLatLng();
    
    const point = this.mapa.latLngToContainerPoint(latLng);
    
    popupElement.style.left = `${point.x}px`;
    popupElement.style.top = `${point.y}px`;
}

togglePopupPegado(transportistaId) {
    const popupData = this.popupsExternos?.[transportistaId];
    if (!popupData) return;
    
    const popupElement = popupData.elemento;
    const estaVisible = popupElement.style.display === 'block';
    popupElement.style.display = estaVisible ? 'none' : 'block';
    if (!estaVisible) {
        this.posicionarPopupExterno(transportistaId, popupData.marker);
        this.actualizarHoraPopupExterno(transportistaId);
    }
    
    console.log(`✅ Popup externo ${estaVisible ? 'ocultado' : 'mostrado'} para ${transportistaId}`);
}
actualizarPosicionPopupExterno(transportistaId, nuevaPosicion) {
    const popupData = this.popupsExternos?.[transportistaId];
    if (!popupData || !this.mapa) return;
    
    const popupElement = popupData.elemento;
    if (popupElement.style.display === 'block') {
        const point = this.mapa.latLngToContainerPoint(nuevaPosicion);
        popupElement.style.transition = 'all 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        popupElement.style.left = `${point.x}px`;
        popupElement.style.top = `${point.y}px`;
        this.actualizarHoraPopupExterno(transportistaId);
    }
}
actualizarHoraPopupExterno(transportistaId) {
    const horaElement = document.getElementById(`hora-externa-${transportistaId}`);
    if (horaElement) {
        horaElement.textContent = new Date().toLocaleTimeString('es-PY');
    }
}
posicionarPopupEnPunta(transportistaId, punto, popupElement) {
    if (!this.mapa || !punto || !popupElement) return;
    
    const point = this.mapa.latLngToContainerPoint([punto.lat, punto.lng]);
    
    popupElement.style.position = 'absolute';
    popupElement.style.zIndex = '1001';
    popupElement.style.left = `${point.x}px`;
    popupElement.style.top = `${point.y - 40}px`; 
    popupElement.style.transform = 'translateX(-50%)';
    popupElement.style.pointerEvents = 'auto'; 
}

    inicializarRuta(transportistaId, ubicacionInicial) {
        this.waypoints[transportistaId] = [{
            lat: ubicacionInicial.latitud,
            lng: ubicacionInicial.longitud,
            timestamp: new Date()
        }];
            const polyline = L.polyline([], {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '10, 10',
            dashOffset: '0',
            className: 'ruta-activa'
        }).addTo(this.mapa);
                polyline.on('add', function() {
            const path = this._path;
            if (path) {
                path.style.animation = 'dash 30s linear infinite';
            }
        });
                this.rutasActivas[transportistaId] = {
            polyline: polyline,
            waypoints: this.waypoints[transportistaId]
        };
        
        console.log(`🔄 Ruta inicializada para transportista ${transportistaId}`);
    }

    actualizarRuta(transportistaId, nuevaUbicacion) {
        const ruta = this.rutasActivas[transportistaId];
        if (!ruta || !this.waypoints[transportistaId]) return;
        
        const nuevoPunto = {
            lat: nuevaUbicacion.latitud,
            lng: nuevaUbicacion.longitud,
            timestamp: new Date()
        };
        
        this.waypoints[transportistaId].push(nuevoPunto);
                if (this.waypoints[transportistaId].length > this.maxWaypoints) {
            this.waypoints[transportistaId].shift();
        }
        
        const puntos = this.waypoints[transportistaId].map(wp => [wp.lat, wp.lng]);
        ruta.polyline.setLatLngs(puntos);
        
        if (this.waypoints[transportistaId].length >= 2) {
            this.calcularYRotarDireccion(transportistaId);
        }
    }
    actualizarRutaHistorica(transportistaId, punto) {
        this.guardarEnHistorico(transportistaId, punto);
        this.dibujarRutaHistorica(transportistaId);
    }
    guardarEnHistorico(transportistaId, punto) {
        if (!this.historicoUbicaciones[transportistaId]) {
            this.historicoUbicaciones[transportistaId] = [];
        }
        
        this.historicoUbicaciones[transportistaId].push(punto);
        
        if (this.historicoUbicaciones[transportistaId].length > this.maxPuntosRuta) {
            this.historicoUbicaciones[transportistaId].shift();
        }
    }
dibujarRutaHistorica(transportistaId) {
    const historico = this.historicoUbicaciones[transportistaId];
    if (!historico || historico.length < 2) return;
        if (this.rutasHistoricas[transportistaId]) {
        this.mapa.removeLayer(this.rutasHistoricas[transportistaId]);
    }
        const puntos = historico.map(p => [p.lat, p.lng]);
    
    const rutaHistorica = L.polyline(puntos, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'ruta-historica'
    }).addTo(this.mapa);
        this.rutasHistoricas[transportistaId] = rutaHistorica;
    
    console.log(`🛣️ Línea azul dibujada: ${transportistaId} - ${historico.length} puntos`);
}
limpiarRutaHistorica(transportistaId) {
    if (this.rutasHistoricas[transportistaId]) {
        this.mapa.removeLayer(this.rutasHistoricas[transportistaId]);
        delete this.rutasHistoricas[transportistaId];
    }
    
    if (this.popupsPunta[transportistaId]) {
        this.mapa.closePopup(this.popupsPunta[transportistaId]);
        delete this.popupsPunta[transportistaId];
    }
    
    delete this.historicoUbicaciones[transportistaId];
    
    console.log(`🧹 Línea y popup limpiados para ${transportistaId}`);
}
    mostrarTodasLasRutas() {
        Object.keys(this.rutasHistoricas).forEach(transportistaId => {
            if (this.rutasHistoricas[transportistaId]) {
                this.mapa.addLayer(this.rutasHistoricas[transportistaId]);
            }
        });
        
        console.log('🛣️ Todas las rutas mostradas');
        this.mostrarNotificacion('Todas las rutas mostradas');
    }
    ocultarTodasLasRutas() {
        Object.keys(this.rutasHistoricas).forEach(transportistaId => {
            if (this.rutasHistoricas[transportistaId]) {
                this.mapa.removeLayer(this.rutasHistoricas[transportistaId]);
            }
        });
        
        console.log('🛣️ Todas las rutas ocultadas');
        this.mostrarNotificacion('Todas las rutas ocultadas');
    }
    limpiarTodasLasRutas() {
        Object.keys(this.historicoUbicaciones).forEach(transportistaId => {
            this.limpiarRutaHistorica(transportistaId);
        });
        
        console.log('🧹 Todas las rutas limpiadas');
        this.mostrarNotificacion('Todas las rutas limpiadas');
    }

    calcularYRotarDireccion(transportistaId) {
        const waypoints = this.waypoints[transportistaId];
        if (waypoints.length < 2) return;
        
        const ultimo = waypoints[waypoints.length - 1];
        const penultimo = waypoints[waypoints.length - 2];
                const dx = ultimo.lng - penultimo.lng;
        const dy = ultimo.lat - penultimo.lat;
        const angulo = Math.atan2(dy, dx) * (180 / Math.PI);
                const marker = this.marcadores[transportistaId] || 
                       this.marcadores[`viaje_${transportistaId}`];
        
        if (marker) {
            const iconElement = marker.getElement();
            if (iconElement) {
                const truckIcon = iconElement.querySelector('.truck-marker div:first-child');
                if (truckIcon) {
                    truckIcon.style.transform = `rotate(${angulo + 90}deg)`;
                }
            }
        }
    }

    limpiarRuta(transportistaId) {
        const ruta = this.rutasActivas[transportistaId];
        if (ruta && ruta.polyline) {
            this.mapa.removeLayer(ruta.polyline);
        }
        
        delete this.rutasActivas[transportistaId];
        delete this.waypoints[transportistaId];
        
        console.log(`🧹 Ruta limpiada para transportista ${transportistaId}`);
    }

    crearMarcadorTransportistaBase(transportistaData, index) {
        try {
            const { transportista, ubicacion } = transportistaData;
            
            if (!transportista || !transportista.id) {
                return false;
            }

            if (!ubicacion || !ubicacion.latitud || !ubicacion.longitud) {
                return false;
            }

            const markerId = transportista.id;
            const markerKey = `base_${markerId}`;
            const tieneSeguimientoActivo = this.viajesActivos.some(viaje => 
                viaje.transportista && viaje.transportista.id === transportista.id
            );

            if (this.marcadores[markerKey]) {
                this.mapa.removeLayer(this.marcadores[markerKey]);
                delete this.marcadores[markerKey];
            }
            if (this.marcadores[markerId]) {
                this.mapa.removeLayer(this.marcadores[markerId]);
                delete this.marcadores[markerId];
            }

            const estaLibre = transportista.estado === 'Libre';
            const color = estaLibre ? '#059669' : '#f59e0b';
            const titulo = estaLibre ? 'Disponible' : 'Ocupado';
            
            let vehiculoEmoji = tieneSeguimientoActivo ? '🚚' : '👤';
            
            const icono = L.divIcon({
                className: `transportista-base-marker ${estaLibre ? 'libre' : 'ocupado'}`,
                html: `
                    <div style="
                        background: ${color}; 
                        color: white; 
                        border-radius: 50%; 
                        width: 45px; 
                        height: 45px; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        font-size: 18px;
                        border: 2px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        cursor: pointer;
                    " title="${transportista.nombre} - ${titulo}">
                        ${vehiculoEmoji}
                    </div>
                `,
                iconSize: [45, 45],
                iconAnchor: [22, 22],
                popupAnchor: [0, -22]
            });

            const marker = L.marker([ubicacion.latitud, ubicacion.longitud], { 
                icon: icono
            }).addTo(this.mapa);
            this.marcadores[markerKey] = marker;
            this.marcadores[markerId] = marker;
            
            console.log(`📍 Marcador base creado: ID=${transportista.id}, Icono=${vehiculoEmoji}`);
            
            return true;
            
        } catch (error) {
            console.error('Error creando marcador:', error);
            return false;
        }
    }

    agregarAnimacionesCSS() {
        if (document.getElementById('truck-animations')) return;
        
        const styles = `
            @keyframes moveTruck {
                0% { transform: translateY(0px); }
                50% { transform: translateY(-3px); }
                100% { transform: translateY(0px); }
            }
            
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.8; }
                100% { transform: scale(1); opacity: 1; }
            }
            
            /* Animación para la línea punteada */
            @keyframes dash {
                to {
                    stroke-dashoffset: -1000;
                }
            }
            
            .truck-marker {
                animation: moveTruck 2s ease-in-out infinite;
            }
            
            .etapa-en-viaje .truck-marker {
                animation: moveTruck 1.5s ease-in-out infinite;
            }
            
            .etapa-entregando .truck-marker {
                animation: pulse 1s ease-in-out infinite;
            }
            
            .transportista-marker.animado {
                transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            
            /* Efecto de estela */
            .truck-marker::after {
                content: '';
                position: absolute;
                bottom: -5px;
                left: 50%;
                width: 20px;
                height: 5px;
                background: linear-gradient(90deg, transparent, rgba(0,0,0,0.1), transparent);
                transform: translateX(-50%);
                border-radius: 50%;
                opacity: 0.7;
            }
            
            /* Estilo para la ruta activa */
            .ruta-activa {
                filter: drop-shadow(0 0 2px rgba(59, 130, 246, 0.5));
            }
            
            .ruta-activa:hover {
                stroke-width: 5;
                opacity: 1;
            }
            
            /* Estilo para la ruta histórica */
            .ruta-historica {
                stroke-linecap: round;
                stroke-linejoin: round;
                filter: drop-shadow(0 0 2px rgba(0,0,0,0.2));
                transition: stroke-width 0.3s ease;
            }
            
            .ruta-historica:hover {
                stroke-width: 5;
                opacity: 0.8;
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.id = 'truck-animations';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    determinarEtapaViaje(viaje) {
        const { ubicacion, pedido_actual } = viaje;
        
        if (!pedido_actual) {
            return { etapa: 'empresa', color: '#059669', emoji: '🏢', titulo: 'En empresa' };
        }

        return { etapa: 'en-viaje', color: '#dc2626', emoji: '🚚', titulo: 'En viaje' };
    }

    crearPopupContentConEtapa(viaje, etapa) {
        const { transportista, ubicacion, pedido_actual } = viaje;
        
        let etapaInfo = '';
        switch(etapa) {
            case 'empresa':
                etapaInfo = '🟢 En base de operaciones';
                break;
            case 'yendo-retiro':
                etapaInfo = '🟡 Yendo al punto de retiro';
                break;
            case 'en-viaje':
                etapaInfo = '🔴 En ruta hacia el destino';
                break;
            case 'entregando':
                etapaInfo = '🟣 Realizando entrega';
                break;
        }

        return `
            <div style="min-width: 260px;">
                <h4 style="margin: 0 0 8px 0; color: #1f2937;">${this.getEmojiEtapa(etapa)} ${transportista.nombre}</h4>
                <div style="font-size: 0.9em;">
                    <p style="margin: 4px 0;"><strong>📞 Teléfono:</strong> ${transportista.telefono || 'No disponible'}</p>
                    <p style="margin: 4px 0;"><strong>🚛 Vehículo:</strong> ${transportista.vehiculo || 'No especificado'}</p>
                    <p style="margin: 4px 0;"><strong>📊 Estado:</strong> ${etapaInfo}</p>
                    ${pedido_actual?.direccion_origen ? `<p style="margin: 4px 0;"><strong>📍 Retiro:</strong> ${pedido_actual.direccion_origen}</p>` : ''}
                    ${pedido_actual?.direccion_destino ? `<p style="margin: 4px 0;"><strong>🎯 Destino:</strong> ${pedido_actual.direccion_destino}</p>` : ''}
                    <p style="margin: 4px 0;"><strong>🕒 Última actualización:</strong> ${new Date().toLocaleTimeString()}</p>
                    <p style="margin: 4px 0;"><strong>🛣️ Puntos de ruta:</strong> ${this.historicoUbicaciones[transportista.id]?.length || 0}</p>
                </div>
            </div>
        `;
    }

    getEmojiEtapa(etapa) {
        const emojis = {
            'empresa': '🏢',
            'yendo-retiro': '📦', 
            'en-viaje': '🚚',
            'entregando': '🎯'
        };
        return emojis[etapa] || '🚚';
    }

    centrarMapaEnTodos() {
    if (!this.mapa) return;

    const todosLosPuntos = [];
    
    if (this.ubicacionEmpresa && this.ubicacionEmpresa.lat && this.ubicacionEmpresa.lng) {
        todosLosPuntos.push([this.ubicacionEmpresa.lat, this.ubicacionEmpresa.lng]);
    }

    if (this.transportistasEnBase && this.transportistasEnBase.length > 0) {
        this.transportistasEnBase.forEach(transportista => {
            if (transportista.ubicacion && transportista.ubicacion.latitud && transportista.ubicacion.longitud) {
                todosLosPuntos.push([transportista.ubicacion.latitud, transportista.ubicacion.longitud]);
            }
        });
    }

    if (this.viajesActivos && this.viajesActivos.length > 0) {
        this.viajesActivos.forEach(viaje => {
            if (viaje.ubicacion && viaje.ubicacion.latitud && viaje.ubicacion.longitud) {
                todosLosPuntos.push([viaje.ubicacion.latitud, viaje.ubicacion.longitud]);
            }
        });
    }
    if (todosLosPuntos.length > 0 && !this.usuarioMoviendoMapa && !this.mapaCentrado) {
        try {
            const group = L.featureGroup(
                todosLosPuntos.map(point => L.marker(point))
            );
            
            const bounds = group.getBounds();
            
            if (bounds.isValid()) {
                this.mapa.fitBounds(bounds.pad(0.15), { 
                    animate: true,
                    duration: 1.5, 
                    padding: [80, 80] 
                });
                this.mapaCentrado = true;
            }
        } catch (error) {
            console.error('❌ Error centrando mapa:', error);
        }
    }
    if (!this.lastManualMove) {
        this.lastManualMove = Date.now();
    }
    
    const timeSinceLastMove = Date.now() - this.lastManualMove;
    if (timeSinceLastMove > 30000 && !this.usuarioMoviendoMapa && todosLosPuntos.length > 0) {
        setTimeout(() => {
            if (this.mapa && !this.usuarioMoviendoMapa) {
                const currentZoom = this.mapa.getZoom();
                const group = L.featureGroup(
                    todosLosPuntos.map(point => L.marker(point))
                );
                const bounds = group.getBounds();
                
                if (bounds.isValid()) {
                    this.mapa.fitBounds(bounds.pad(0.1), {
                        animate: true,
                        duration: 2, 
                        padding: [50, 50]
                    });
                    
                    setTimeout(() => {
                        if (this.mapa && !this.usuarioMoviendoMapa) {
                            this.mapa.setZoom(currentZoom, { 
                                animate: true,
                                duration: 1 
                            });
                        }
                    }, 2100);
                }
            }
        }, 100);
    }
}

actualizarVistaTracking() {
    const container = document.getElementById('lista-viajes-activos');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!this.viajesActivos || this.viajesActivos.length === 0) {
        container.innerHTML = `
            <div class="estado-vacio">
                <i class="fas fa-truck"></i>
                <p>No hay transportistas en movimiento</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = this.viajesActivos.map(viaje => {
        const t = viaje.transportista;
        const p = viaje.pedido_actual || {};
        
        return `
            <div class="card etapa-en-viaje">
                <div class="card-header">
                    <div class="card-title">${t.nombre || 'Transportista'}</div>
                    <span class="status-badge badge-en-viaje">EN VIAJE</span>
                </div>
                <div class="card-content">
                    ${this.crearFilaCard('📞', t.telefono || 'Sin teléfono')}
                    ${this.crearFilaCard('🚛', t.vehiculo || 'Sin vehículo')}
                    ${p.direccion_origen ? this.crearFilaCard('📍', p.direccion_origen) : ''}
                    ${p.direccion_destino ? this.crearFilaCard('🎯', p.direccion_destino) : ''}
                    ${this.crearFilaCard('🕒', new Date().toLocaleTimeString())}
                </div>
                <div class="card-actions">
                    <!-- BOTÓN SIMPLE QUE SIEMPRE FUNCIONA -->
                    <button class="btn btn-outline" onclick="panelEmpresas.centrarEnTransportista(${t.id})">
                        <i class="fas fa-crosshairs"></i> Centrar
                    </button>
                    <button class="btn btn-outline" onclick="panelEmpresas.iniciarChatConTransportista(${t.id}, '${t.nombre.replace(/'/g, "\\'")}')">
                        <i class="fas fa-comments"></i> Chat
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

    mostrarRutaTransportista(transportistaId) {
        const ruta = this.rutasHistoricas[transportistaId];
        if (ruta) {
            this.mapa.addLayer(ruta);
            this.centrarEnTransportista(transportistaId);
            this.mostrarNotificacion(`Ruta de ${this.viajesActivos.find(v => v.transportista.id === transportistaId)?.transportista.nombre || 'transportista'} mostrada`);
        } else {
            this.mostrarNotificacion('No hay ruta registrada para este transportista');
        }
    }
centrarEnTransportista(transportistaId) {
    console.log(`🎯 Centrando en transportista: ${transportistaId}`);
    let transportista = null;
    let ubicacion = null;
    
    for (const viaje of this.viajesActivos) {
        if (viaje.transportista && viaje.transportista.id == transportistaId) {
            transportista = viaje.transportista;
            ubicacion = viaje.ubicacion;
            break;
        }
    }
    if (!transportista) {
        for (const tBase of this.transportistasEnBase) {
            if (tBase.transportista && tBase.transportista.id == transportistaId) {
                transportista = tBase.transportista;
                ubicacion = tBase.ubicacion;
                break;
            }
        }
    }
    
    if (!transportista || !ubicacion) {
        console.error('❌ Transportista no encontrado:', transportistaId);
        return;
    }
    
    if (this.mapa) {
        this.mapa.setView([ubicacion.latitud, ubicacion.longitud], 16, {
            animate: true,
            duration: 1
        });
        
        const markerKey = `viaje_${transportistaId}`;
        const marker = this.marcadores[markerKey] || 
                      this.marcadores[transportistaId] ||
                      this.marcadores[`base_${transportistaId}`];
        
        if (marker) {
            marker.setLatLng([ubicacion.latitud, ubicacion.longitud]);
            
            console.log(`✅ Centro en ${transportista.nombre} SIN abrir popup`);
        } else {
            console.warn(`⚠️ No se encontró marcador para transportista ${transportistaId}`);
            const tempMarker = L.marker([ubicacion.latitud, ubicacion.longitud], {
                icon: L.divIcon({
                    className: 'temp-marker',
                    html: `<div style="background: #dc2626; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold;">${this.obtenerIniciales(transportista.nombre)}</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(this.mapa);
            
            this.marcadores[`temp_${transportistaId}`] = tempMarker;
            setTimeout(() => {
                if (tempMarker && this.mapa) {
                    this.mapa.removeLayer(tempMarker);
                    delete this.marcadores[`temp_${transportistaId}`];
                }
            }, 3000);
        }
    }
}

    centrarEnCoordenadas(lat, lng) {
        if (this.mapa) {
            this.mapa.setView([lat, lng], 16, {
                animate: true,
                duration: 1
            });
            console.log(`📍 Centrando en coordenadas: ${lat}, ${lng}`);
        }
    }

    detenerActualizacionAutomatica() {
        if (this.intervaloTracking) {
            clearInterval(this.intervaloTracking);
            this.intervaloTracking = null;
        }
    }
    crearEstadoVacio(mensaje) {
        return `
            <div class="estado-vacio">
                <i class="fas fa-inbox"></i>
                <p>${mensaje}</p>
            </div>
        `;
    }

    crearEstadoError(mensaje) {
        return `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${mensaje}</p>
            </div>
        `;
    }

    mostrarLoading(container, mensaje) {
        container.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>${mensaje}</p>
            </div>
        `;
    }

    formatearGuaranies(monto) {
        if (!monto || monto === 0) return 'Gs. 0';
        const montoFormateado = parseFloat(monto).toLocaleString('es-PY', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        return `Gs. ${montoFormateado}`;
    }

    formatearFecha(fechaString) {
        if (!fechaString) return 'No especificada';
        try {
            const fecha = new Date(fechaString);
            return fecha.toLocaleDateString('es-ES') + ' ' + fecha.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch {
            return fechaString;
        }
    }

    obtenerClaseEstado(estado) {
        const mapaEstados = {
            'EN CAMINO': 'en-curso',
            'ACEPTADO': 'asignado',
            'ENTREGADO': 'completado',
            'RECHAZADO': 'rechazado',
            'PENDIENTE': 'pendiente'
        };
        return mapaEstados[estado] || 'pendiente';
    }

    obtenerClaseBadge(estado) {
        const mapaClases = {
            'EN CAMINO': 'badge-asignado',
            'ACEPTADO': 'badge-asignado',
            'ENTREGADO': 'badge-libre',
            'RECHAZADO': 'badge-rechazado',
            'PENDIENTE': 'badge-pendiente'
        };
        return mapaClases[estado] || 'badge-pendiente';
    }

    obtenerTextoEstado(estado) {
        const mapaTextos = {
            'EN CAMINO': '🛣️ En camino',
            'ACEPTADO': '✅ Aceptado',
            'ENTREGADO': '✅ Entregado',
            'RECHAZADO': '❌ Rechazado',
            'PENDIENTE': '⏳ Pendiente'
        };
        return mapaTextos[estado] || '⏳ Pendiente';
    }

    mostrarError(mensaje) {
        console.error(mensaje);
        alert(mensaje);
    }

    mostrarNotificacion(mensaje) {
        const notificacion = document.createElement('div');
        notificacion.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #059669;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            font-weight: 500;
        `;
        notificacion.innerHTML = `<i class="fas fa-check-circle"></i> ${mensaje}`;
        document.body.appendChild(notificacion);
        
        setTimeout(() => {
            document.body.removeChild(notificacion);
        }, 3000);
    }

    redirigirALogin() {
        window.location.href = 'login.html';
    }

    cerrarSesion() {
        if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
            this.detenerActualizacionAutomatica();
            localStorage.clear();
            if (this.socket) this.socket.disconnect();
            window.location.href = 'login.html';
        }
    }

    async cargarGastosPorEnvios(idsEnvios) {
        try {
            const token = localStorage.getItem('adminToken');
            if (!token) return {};

            const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-envios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids_envios: idsEnvios })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    return data.gastos_por_envio || {};
                }
            }
            return {};
        } catch (error) {
            console.error('❌ Error cargando gastos por envíos:', error);
            return {};
        }
    }

  async cargarGastosDetalladosPorEnvios(idsEnvios) {
    try {
        const token = localStorage.getItem('adminToken');
        
        if (!idsEnvios || idsEnvios.length === 0) return {};
        const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-detallados`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                ids_envios: idsEnvios
            })
        });
        
        if (!response.ok) {
            console.error('❌ Error cargando gastos detallados:', response.status);
            return {};
        }
        
        const data = await response.json();
        
        console.log('✅ Gastos detallados cargados:', data);
        return data.success ? data.gastos_detallados || {} : {};
        
    } catch (error) {
        console.error('❌ Error cargando gastos detallados:', error);
        return {};
    }
}

    async cargarViajesConGastosParaReportes() {
        const container = document.getElementById('lista-viajes-gastos');
        if (!container) return;

        try {
            this.mostrarLoading(container, 'Cargando viajes entregados y gastos...');

            if (!this.viajes || this.viajes.length === 0) {
                await this.cargarViajes();
            }

            if (!this.viajes || this.viajes.length === 0) {
                container.innerHTML = this.crearEstadoVacio('No hay viajes registrados');
                this.actualizarEstadisticasHeader([], {});
                return;
            }

            const viajesEntregados = this.viajes.filter(viaje => {
                const estado = viaje.estado?.toUpperCase();
                return estado === 'ENTREGADO';
            });
            
            if (viajesEntregados.length === 0) {
                container.innerHTML = this.crearEstadoVacio('No hay viajes entregados para mostrar');
                this.actualizarEstadisticasHeader([], {});
                return;
            }

            const idsEnvios = viajesEntregados.map(v => v.id_envio).filter(Boolean);
            const gastosDetallados = await this.cargarGastosDetalladosPorEnvios(idsEnvios);

            this.actualizarEstadisticasHeader(viajesEntregados, gastosDetallados);

            const viajesOrdenados = [...viajesEntregados].sort((a, b) => b.id_envio - a.id_envio);

            container.innerHTML = this.crearHTMLReportes(viajesOrdenados, gastosDetallados);

        } catch (error) {
            console.error('❌ Error cargando viajes con gastos:', error);
            container.innerHTML = this.crearEstadoError('Error cargando viajes y gastos: ' + error.message);
            this.actualizarEstadisticasHeader([], {});
        }
    }

  crearHTMLReportes(viajes, gastosDetallados) {
    return viajes.map(viaje => {
        const gastos = gastosDetallados[viaje.id_envio] || [];
        const totalGastos = gastos.reduce((sum, gasto) => sum + parseFloat(gasto.monto || 0), 0);
        
        const ingresoTotal = parseFloat(viaje.costo) || 0;
        const utilidadTransportista = ingresoTotal * 0.3; 
        const baseEmpresa = ingresoTotal * 0.7; 
        const utilidadNetaEmpresa = baseEmpresa - totalGastos; 
        const margenEmpresa = baseEmpresa > 0 ? (utilidadNetaEmpresa / baseEmpresa) * 100 : 0;

        return `
            <div class="card completado" style="margin-bottom: 24px; border-left: 4px solid #059669;">
                <div class="card-header">
                    <div class="card-title">Viaje #${viaje.id_envio} - ${viaje.transportista_nombre || 'Sin transportista'}</div>
                    <span class="status-badge badge-success">
                        <i class="fas fa-check-circle"></i> Entregado
                    </span>
                </div>
                
                <div class="card-content">
                    <!-- DESCRIPCIÓN -->
                    <div style="margin-bottom: 20px;">
                        <div style="color: var(--text-light); font-size: 0.9em; margin-bottom: 4px;">Descripción</div>
                        <div style="color: var(--text);">${viaje.descripcion || 'Sin descripción'}</div>
                    </div>
                    
                    <!-- ORIGEN Y DESTINO -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                        <div>
                            <div style="color: var(--text-light); font-size: 0.9em; margin-bottom: 4px;">Origen</div>
                            <div style="color: var(--text); font-weight: 500;">
                                ${viaje.direccion_origen || 'No especificado'}
                            </div>
                        </div>
                        
                        <div>
                            <div style="color: var(--text-light); font-size: 0.9em; margin-bottom: 4px;">Destino</div>
                            <div style="color: var(--text); font-weight: 500;">
                                ${viaje.direccion_destino || 'No especificado'}
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0;">
                        <div style="color: var(--text-light); font-size: 0.9em; margin-bottom: 4px;">Fecha de Envío</div>
                        <div style="color: var(--text);">
                            ${viaje.fecha_envio ? new Date(viaje.fecha_envio).toLocaleDateString('es-ES') : 'No especificada'}
                        </div>
                    </div>
                    
                    <!-- TABLA FINANCIERA - 5 COLUMNAS -->
                    <div style="margin: 25px 0; overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.95em;">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0;">Ingreso</th>
                                    <th style="text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0;">Gastos</th>
                                    <th style="text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0;">Utilidad Transportista</th>
                                    <th style="text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0;">Utilidad Empresa</th>
                                    <th style="text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0;">Margen</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <!-- INGRESO -->
                                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                        <div style="font-size: 1.1em; font-weight: 700; color: #3b82f6;">
                                            ${this.formatearGuaranies(ingresoTotal)}
                                        </div>
                                    </td>
                                    
                                    <!-- GASTOS -->
                                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                        <div style="font-size: 1.1em; font-weight: 700; color: ${totalGastos > 0 ? '#d97706' : '#64748b'};">
                                            ${this.formatearGuaranies(totalGastos)}
                                        </div>
                                        ${totalGastos > 0 ? `
                                            <div style="font-size: 0.8em; color: #92400e; margin-top: 3px;">
                                                Ver detalles abajo ↓
                                            </div>
                                        ` : ''}
                                    </td>
                                    
                                    <!-- UTILIDAD TRANSPORTISTA -->
                                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                        <div style="font-size: 1.1em; font-weight: 700; color: #d97706;">
                                            ${this.formatearGuaranies(utilidadTransportista)}
                                        </div>
                                        <div style="font-size: 0.8em; color: #92400e; margin-top: 3px;">
                                            30% del ingreso
                                        </div>
                                    </td>
                                    
                                    <!-- UTILIDAD EMPRESA -->
                                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                        <div style="font-size: 1.1em; font-weight: 700; color: ${utilidadNetaEmpresa >= 0 ? '#059669' : '#dc2626'};">
                                            ${this.formatearGuaranies(utilidadNetaEmpresa)}
                                        </div>
                                        <div style="font-size: 0.8em; color: ${utilidadNetaEmpresa >= 0 ? '#065f46' : '#991b1b'}; margin-top: 3px;">
                                            70% - gastos
                                        </div>
                                    </td>
                                    
                                    <!-- MARGEN -->
                                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                        <div style="font-size: 1.1em; font-weight: 700; color: ${margenEmpresa >= 0 ? '#059669' : '#dc2626'};">
                                            ${margenEmpresa.toFixed(1)}%
                                        </div>
                                        <div style="font-size: 0.8em; color: #64748b; margin-top: 3px;">
                                            de su 70%
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- SECCIÓN DE GASTOS EN HORIZONTAL -->
                    ${gastos.length > 0 ? `
                        <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                                <i class="fas fa-receipt" style="color: #d97706; font-size: 1.1em;"></i>
                                <div style="font-weight: 600; color: var(--text);">Detalle de Gastos (${gastos.length})</div>
                            </div>
                            
                            <div style="overflow-x: auto; padding-bottom: 10px;">
                                <div style="display: flex; gap: 15px; min-width: max-content;">
                                    ${(() => {
                                        let gastosHTML = '';
                                        for (let i = 0; i < gastos.length; i++) {
                                            const gasto = gastos[i];
                                            const fechaFormateada = new Date(gasto.fecha_gasto).toLocaleDateString('es-ES');
                                            const transportista = gasto.nombre_transportista || viaje.transportista_nombre || 'No especificado';
                                            
                                            gastosHTML += `
                                                <div style="min-width: 250px; background: #fef3c7; border-radius: 8px; padding: 16px; border-left: 4px solid #d97706; flex-shrink: 0;">
                                                    <!-- DESCRIPCIÓN -->
                                                    <div style="margin-bottom: 12px;">
                                                        <div style="color: #92400e; font-size: 0.9em; margin-bottom: 4px; font-weight: 600;">Descripción</div>
                                                        <div style="color: var(--text); font-size: 1em;">
                                                            ${gasto.descripcion || 'Sin descripción'}
                                                        </div>
                                                    </div>
                                                    
                                                    <div style="margin-bottom: 10px;">
                                                        <div style="color: #92400e; font-size: 0.9em; margin-bottom: 4px;">Monto</div>
                                                        <div style="color: #d97706; font-weight: 700; font-size: 1.2em;">
                                                            ${this.formatearGuaranies(gasto.monto)}
                                                        </div>
                                                    </div>
                                                    
                                                    ${gasto.comentario ? `
                                                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #fbbf24;">
                                                            <div style="color: #92400e; font-size: 0.9em; margin-bottom: 4px;">Comentario</div>
                                                            <div style="color: var(--text); font-size: 0.9em; font-style: italic;">
                                                                "${gasto.comentario}"
                                                            </div>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            `;
                                        }
                                        return gastosHTML;
                                    })()}
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div style="margin-top: 20px; padding: 12px; background: #f0f9ff; border-radius: 8px; text-align: center;">
                            <div style="color: #0c4a6e; font-size: 0.95em;">
                                <i class="fas fa-info-circle" style="margin-right: 6px;"></i>
                                No se registraron gastos para este viaje
                            </div>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

    actualizarEstadisticasHeader(viajesEntregados, gastosDetallados) {
        try {
            const totalViajes = viajesEntregados.length;
            
            let totalGastos = 0;
            let viajesConGastos = 0;
            let viajesSinGastos = 0;
            
            viajesEntregados.forEach(viaje => {
                const gastos = gastosDetallados[viaje.id_envio] || [];
                const gastosViaje = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
                
                totalGastos += gastosViaje;
                
                if (gastosViaje > 0) {
                    viajesConGastos++;
                } else {
                    viajesSinGastos++;
                }
            });
            
            const eficiencia = totalViajes > 0 ? ((viajesSinGastos / totalViajes) * 100) : 0;
            
            const elementos = {
                'total-viajes-entregados': totalViajes.toString(),
                'gastos-totales': this.formatearGuaranies(totalGastos),
                'utilidad-neta': eficiencia.toFixed(0) + '%'
            };
            
            Object.entries(elementos).forEach(([id, valor]) => {
                const elemento = document.getElementById(id);
                if (elemento) {
                    elemento.textContent = valor;
                }
            });
            
        } catch (error) {
            console.error('❌ Error actualizando estadísticas:', error);
        }
    }

    async recargarReportesCompleto() {
        try {
            const boton = document.getElementById('btnActualizarReportes');
            const textoOriginal = boton?.innerHTML;
            if (boton) {
                boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
                boton.disabled = true;
            }

            await this.cargarViajes();
            await this.cargarViajesConGastosParaReportes();
            
            if (boton) {
                boton.innerHTML = textoOriginal;
                boton.disabled = false;
            }
            
            this.mostrarNotificacion('Reportes financieros actualizados');
            
        } catch (error) {
            console.error('❌ Error recargando reportes:', error);
            this.mostrarError('Error al actualizar reportes: ' + error.message);
            
            const boton = document.getElementById('btnActualizarReportes');
            if (boton) {
                boton.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
                boton.disabled = false;
            }
        }
    }

    async recargarTrackingCompleto() {
        try {
            const boton = document.getElementById('btnActualizarTracking');
            const textoOriginal = boton?.innerHTML;
            if (boton) {
                boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
                boton.disabled = true;
            }

            const container = document.getElementById('lista-viajes-activos');
            if (container) {
                container.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Actualizando ubicaciones en tiempo real...</p>
                    </div>
                `;
            }

            await this.cargarTracking();
            
            if (boton) {
                boton.innerHTML = textoOriginal;
                boton.disabled = false;
            }
            
            this.mostrarNotificacion('Tracking actualizado correctamente');
            
        } catch (error) {
            console.error('❌ Error recargando tracking:', error);
            this.mostrarError('Error al actualizar el tracking: ' + error.message);
            
            const boton = document.getElementById('btnActualizarTracking');
            if (boton) {
                boton.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
                boton.disabled = false;
            }
        }
    }

    exportarPDF() {
        try {
            const viajesEntregados = this.viajes.filter(viaje => 
                viaje.estado?.toUpperCase() === 'ENTREGADO'
            );
            
            if (viajesEntregados.length === 0) {
                alert('No hay viajes entregados para exportar');
                return;
            }

            this.mostrarLoadingPDF();
            
            setTimeout(async () => {
                try {
                    const idsEnvios = viajesEntregados.map(v => v.id_envio).filter(Boolean);
                    const gastosDetallados = await this.cargarGastosDetalladosPorEnvios(idsEnvios);
                    this.generarPDFCompleto(viajesEntregados, gastosDetallados);
                } catch (error) {
                    console.error('❌ Error cargando gastos para PDF:', error);
                    this.generarPDFCompleto(viajesEntregados, {});
                }
            }, 1000);
            
        } catch (error) {
            console.error('❌ Error exportando PDF:', error);
            alert('Error al generar el PDF: ' + error.message);
        }
    }

    mostrarLoadingPDF() {
        const botonPDF = document.getElementById('btnExportarPDF');
        if (botonPDF) {
            const textoOriginal = botonPDF.innerHTML;
            botonPDF.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando PDF...';
            botonPDF.disabled = true;
            
            setTimeout(() => {
                botonPDF.innerHTML = textoOriginal;
                botonPDF.disabled = false;
            }, 3000);
        }
    }

 generarPDFCompleto(viajesEntregados, gastosDetallados = {}) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const nombreEmpresa = this.empresaData.nombre_empresa || 'Mi Empresa';
        const fechaActual = new Date().toLocaleDateString('es-PY');
        
        doc.setFontSize(18);
        doc.setTextColor(0, 0, 0); 
        doc.setFont('helvetica', 'bold');
        doc.text(nombreEmpresa.toUpperCase(), 20, 20);
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0); 
        doc.setFont('helvetica', 'normal');
        doc.text(`FECHA: ${fechaActual}`, 160, 20, { align: 'right' });
        doc.text(`TOTAL VIAJES: ${viajesEntregados.length}`, 160, 26, { align: 'right' });
        doc.setDrawColor(0, 0, 0); 
        doc.setLineWidth(0.5);
        doc.line(20, 35, 190, 35);

        const ingresosBrutos = viajesEntregados.reduce((sum, viaje) => 
            sum + (parseFloat(viaje.costo || 0) || 0), 0);

        const pagoTransportistas = ingresosBrutos * 0.3;
        
        let gastosTotales = 0;
        if (gastosDetallados && typeof gastosDetallados === 'object') {
            Object.values(gastosDetallados).forEach(gastos => {
                if (Array.isArray(gastos)) {
                    gastosTotales += gastos.reduce((sum, gasto) => 
                        sum + (parseFloat(gasto.monto || 0) || 0), 0);
                }
            });
        }
        
        const ingresosNetosEmpresa = (ingresosBrutos * 0.7) - gastosTotales;
        
        const formatNumber = (num) => {
            return new Intl.NumberFormat('es-PY').format(Math.round(num || 0));
        };
        
        let yPos = 45;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMEN FINANCIERO', 20, yPos);
        yPos += 10;
        
        doc.setFillColor(245, 245, 245);
        doc.rect(20, yPos, 170, 35, 'F');
        doc.setDrawColor(0, 0, 0); 
        doc.setLineWidth(0.3);
        doc.rect(20, yPos, 170, 35);
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0); 
        doc.setFont('helvetica', 'bold');
        doc.text('INGRESOS BRUTOS:', 25, yPos + 8);
        doc.text('GASTOS TOTALES:', 25, yPos + 16);
        doc.text('INGRESOS NETOS EMPRESA:', 25, yPos + 24);
        doc.text('PAGO TRANSPORTISTAS:', 25, yPos + 32);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0); 
        doc.text(`Gs. ${formatNumber(ingresosBrutos)}`, 165, yPos + 8, { align: 'right' });
        doc.text(`Gs. ${formatNumber(gastosTotales)}`, 165, yPos + 16, { align: 'right' });
        doc.text(`Gs. ${formatNumber(ingresosNetosEmpresa)}`, 165, yPos + 24, { align: 'right' });
        doc.text(`Gs. ${formatNumber(pagoTransportistas)}`, 165, yPos + 32, { align: 'right' });
        yPos += 40;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0); 
        doc.setFont('helvetica', 'bold');
        doc.text('MARGEN NETO EMPRESA:', 25, yPos);
        
        const margen = ingresosBrutos > 0 ? ((ingresosNetosEmpresa / ingresosBrutos) * 100) : 0;
        doc.setTextColor(0, 0, 0); 
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${margen.toFixed(1)}%`, 165, yPos, { align: 'right' });
        
        yPos += 15;
        if (viajesEntregados.length > 0) {
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0); 
            doc.setFont('helvetica', 'bold');
            doc.text('DETALLE POR VIAJE', 20, yPos);
            yPos += 10;
            const columnas = [
                { titulo: 'ID', ancho: 15, x: 20 },
                { titulo: 'DESTINO', ancho: 70, x: 35 },
                { titulo: 'ING. BRUTO', ancho: 30, x: 105 },
                { titulo: 'GASTOS', ancho: 25, x: 135 },
                { titulo: 'ING. NETO', ancho: 30, x: 160 },
                { titulo: 'MARGEN', ancho: 20, x: 190, align: 'right' }
            ];
            
            doc.setFillColor(40, 40, 40); 
            doc.rect(20, yPos, 170, 8, 'F');
            doc.setFontSize(9);
            doc.setTextColor(255, 255, 255); 
            doc.setFont('helvetica', 'bold');
            
            columnas.forEach(col => {
                const align = col.align || 'left';
                doc.text(col.titulo, col.x, yPos + 6, { align: align });
            });
            
            yPos += 8;
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            
            viajesEntregados.forEach((viaje, index) => {
                let gastosViaje = [];
                if (gastosDetallados && gastosDetallados[viaje.id_envio]) {
                    gastosViaje = gastosDetallados[viaje.id_envio];
                }
                
                const totalGastos = gastosViaje.reduce((sum, gasto) => 
                    sum + (parseFloat(gasto.monto || 0) || 0), 0);
                const ingresoBruto = parseFloat(viaje.costo || 0) || 0;
                const ingresoNeto = ingresoBruto - totalGastos;
                const margenViaje = ingresoBruto > 0 ? ((ingresoNeto / ingresoBruto) * 100) : 0;
                
                const idViaje = viaje.id_envio || viaje.id || '-';
                const destino = viaje.direccion_destino || viaje.destino || 'Sin destino';
                const lineasDestino = this.dividirTexto(destino, 40);
                const alturaFila = Math.max(8, lineasDestino.length * 4);
                
                if (yPos + alturaFila > 280) {
                    doc.addPage();
                    yPos = 20;
                    doc.setFillColor(40, 40, 40);
                    doc.rect(20, yPos, 170, 8, 'F');
                    doc.setFontSize(9);
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    
                    columnas.forEach(col => {
                        const align = col.align || 'left';
                        doc.text(col.titulo, col.x, yPos + 6, { align: align });
                    });
                    
                    yPos += 8;
                }
                if (index % 2 === 0) {
                    doc.setFillColor(250, 250, 250);
                    doc.rect(20, yPos, 170, alturaFila, 'F');
                }
                
                doc.setTextColor(0, 0, 0); 
                doc.setFont('helvetica', 'bold');
                doc.text(idViaje.toString(), columnas[0].x, yPos + (alturaFila / 2) + 1);
                doc.setTextColor(0, 0, 0); 
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                let lineaY = yPos + 3;
                for (let i = 0; i < lineasDestino.length; i++) {
                    doc.text(lineasDestino[i], columnas[1].x, lineaY);
                    lineaY += 3.5;
                }
                doc.setFontSize(9);
                doc.setTextColor(0, 0, 0); 
                doc.setFont('helvetica', 'bold');
                doc.text(`Gs. ${formatNumber(ingresoBruto)}`, columnas[2].x, yPos + (alturaFila / 2) + 1);
                doc.setTextColor(0, 0, 0); 
                doc.text(`Gs. ${formatNumber(totalGastos)}`, columnas[3].x, yPos + (alturaFila / 2) + 1);
                doc.setTextColor(0, 0, 0); 
                doc.text(`Gs. ${formatNumber(ingresoNeto)}`, columnas[4].x, yPos + (alturaFila / 2) + 1);
                doc.setTextColor(0, 0, 0); 
                doc.text(`${margenViaje.toFixed(0)}%`, columnas[5].x, yPos + (alturaFila / 2) + 1, { align: 'right' });
                
                yPos += alturaFila;
            });
        }
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
        
            doc.setDrawColor(0, 0, 0); 
            doc.setLineWidth(0.5);
            doc.line(20, 280, 190, 280);
            
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0); 
            doc.setFont('helvetica', 'normal');
            
            doc.text(`Página ${i} de ${pageCount}`, 20, 285);
            
            doc.setFont('helvetica', 'bold');
            doc.text(nombreEmpresa, 105, 285, { align: 'center' });
            
            doc.setFont('helvetica', 'normal');
            doc.text(fechaActual, 190, 285, { align: 'right' });
        }
        
        const fechaArchivo = new Date().toISOString().split('T')[0];
        const nombreArchivo = `REPORTE-${nombreEmpresa.replace(/\s+/g, '-')}-${fechaArchivo}.pdf`;
        doc.save(nombreArchivo);
        
        this.mostrarNotificacion('PDF generado correctamente');
        
    } catch (error) {
        console.error('❌ Error generando PDF:', error);
        alert('Error al generar el PDF: ' + error.message);
    }
}
async cargarReporteFinancieroCompleto() {
    try {
        const { 
            ingresosBrutos, 
            ingresosNetosEmpresa,
            pagoTransportistas,
            gastosTotales 
        } = await this.calcularIngresosReales();
        
        const viajesEntregados = this.viajes ? 
            this.viajes.filter(v => v.estado === 'ENTREGADO') : [];
        
        const idsEnvios = viajesEntregados.map(v => v.id_envio).filter(Boolean);
        const gastosDetallados = idsEnvios.length > 0 ? 
            await this.cargarGastosDetalladosPorEnvios(idsEnvios) : {};
        
        const elementos = {
            'total-viajes-entregados': viajesEntregados.length,
            'ingresos-brutos': `Gs. ${new Intl.NumberFormat('es-PY').format(ingresosBrutos)}`,
            'pago-transportistas': `Gs. ${new Intl.NumberFormat('es-PY').format(pagoTransportistas)}`,
            'gastos-totales': `Gs. ${new Intl.NumberFormat('es-PY').format(gastosTotales)}`,
            'ingresos-netos': `Gs. ${new Intl.NumberFormat('es-PY').format(ingresosNetosEmpresa)}`
        };
        
        Object.entries(elementos).forEach(([id, valor]) => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.textContent = valor;
        });
        
        this.generarListaViajesFinancieros(viajesEntregados, gastosDetallados);
        
        return {
            viajesEntregados,
            ingresosBrutos,
            pagoTransportistas,
            gastosTotales,
            ingresosNetosEmpresa,
            gastosDetallados
        };
        
    } catch (error) {
        console.error('❌ Error cargando reporte financiero:', error);
        return null;
    }
}
generarListaViajesFinancieros(viajesEntregados, gastosDetallados) {
    const contenedor = document.getElementById('lista-viajes-gastos');
    if (!contenedor) {
        console.error('❌ No se encontró el contenedor #lista-viajes-gastos');
        return;
    }
    
    if (viajesEntregados.length === 0) {
        contenedor.innerHTML = `
            <div class="estado-vacio">
                <i class="fas fa-chart-line"></i>
                <p>No hay viajes entregados</p>
                <small>Los reportes financieros aparecerán aquí</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    viajesEntregados.forEach(viaje => {
        const ingresoTotal = parseFloat(viaje.costo) || 0;
        
        const pagoTransportista = ingresoTotal * 0.3;
        
        const baseEmpresa = ingresoTotal * 0.7;
        
        let gastosViaje = 0;
        if (gastosDetallados[viaje.id_envio]) {
            gastosViaje = gastosDetallados[viaje.id_envio].reduce((sum, gasto) => {
                return sum + (parseFloat(gasto.monto) || 0);
            }, 0);
        }
        const utilidadNetaEmpresa = baseEmpresa - gastosViaje;
        const margen = baseEmpresa > 0 ? (utilidadNetaEmpresa / baseEmpresa) * 100 : 0;
        const margenTransportista = 100;
        
        const fecha = viaje.fecha_envio ? 
            new Date(viaje.fecha_envio).toLocaleDateString('es-PY') : 'Sin fecha';
        
        const clienteNombre = viaje.cliente_nombre || viaje.nombre_cliente || 'Cliente';
        html += `
            <div class="card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fas fa-shipping-fast"></i>
                        Viaje #${viaje.id_envio || viaje.id} - ${viaje.transportista_nombre || 'Transportista'}
                    </div>
                    <div class="status-badge badge-success">
                        ${viaje.estado || 'ENTREGADO'}
                    </div>
                </div>
                
                <div class="card-content">
                    <div class="card-row">
                        <i class="fas fa-user"></i>
                        <span><strong>Cliente:</strong> ${clienteNombre}</span>
                    </div>
                    <div class="card-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span><strong>Origen:</strong> ${viaje.direccion_origen || 'Sin dirección'}</span>
                    </div>
                    <div class="card-row">
                        <i class="fas fa-flag-checkered"></i>
                        <span><strong>Destino:</strong> ${viaje.direccion_destino || 'Sin dirección'}</span>
                    </div>
                    <div class="card-row">
                        <i class="fas fa-calendar"></i>
                        <span><strong>Fecha:</strong> ${fecha}</span>
                    </div>
                    <div class="card-row">
                        <i class="fas fa-file-alt"></i>
                        <span><strong>Descripción:</strong> ${viaje.descripcion || 'Sin descripción'}</span>
                    </div>
                    
                    <!-- TABLA DE FINANZAS - COMPLETA -->
                    <div style="margin-top: 15px; border-top: 1px solid var(--border); padding-top: 15px;">
                        <h4 style="margin-bottom: 15px; color: var(--text); text-align: center;">Detalles Financieros</h4>
                        
                        <!-- RESUMEN PRINCIPAL -->
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
                            <!-- INGRESO TOTAL -->
                            <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
                                <div style="font-size: 0.8em; color: var(--text-light); margin-bottom: 5px;">Ingreso Total</div>
                                <div style="font-size: 1.2em; font-weight: 700; color: var(--primary);">
                                    Gs. ${new Intl.NumberFormat('es-PY').format(ingresoTotal)}
                                </div>
                            </div>
                            
                            <!-- UTILIDAD TRANSPORTISTA -->
                            <div style="text-align: center; padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                                <div style="font-size: 0.8em; color: var(--text-light); margin-bottom: 5px;">Utilidad Transportista</div>
                                <div style="font-size: 1.2em; font-weight: 700; color: #d97706;">
                                    Gs. ${new Intl.NumberFormat('es-PY').format(pagoTransportista)}
                                </div>
                                <div style="font-size: 0.7em; color: #92400e; margin-top: 5px;">
                                    (30% del ingreso)
                                </div>
                            </div>
                            
                            <!-- UTILIDAD NETA EMPRESA -->
                            <div style="text-align: center; padding: 15px; background: #ecfdf5; border-radius: 8px; border-left: 4px solid #059669;">
                                <div style="font-size: 0.8em; color: var(--text-light); margin-bottom: 5px;">Utilidad Neta Empresa</div>
                                <div style="font-size: 1.2em; font-weight: 700; color: ${utilidadNetaEmpresa >= 0 ? '#059669' : '#dc2626'};">
                                    Gs. ${new Intl.NumberFormat('es-PY').format(utilidadNetaEmpresa)}
                                </div>
                                <div style="font-size: 0.7em; color: ${utilidadNetaEmpresa >= 0 ? '#065f46' : '#991b1b'}; margin-top: 5px;">
                                    (70% del ingreso - gastos)
                                </div>
                            </div>
                            
                            <!-- MARGENES -->
                            <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
                                <div style="font-size: 0.8em; color: var(--text-light); margin-bottom: 5px;">Margen</div>
                                <div style="display: flex; justify-content: space-around;">
                                    <div>
                                        <div style="font-size: 1em; font-weight: 600; color: #059669;">${margen.toFixed(1)}%</div>
                                        <div style="font-size: 0.6em; color: #64748b;">Empresa</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 1em; font-weight: 600; color: #d97706;">${margenTransportista}%</div>
                                        <div style="font-size: 0.6em; color: #64748b;">Transportista</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- DESGLOSE DETALLADO -->
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 15px;">
                            <h5 style="margin-bottom: 10px; color: var(--text);">Desglose Detallado</h5>
                            
                            <!-- Fila 1: Ingreso total -->
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                <span style="color: var(--text);">Ingreso total del viaje:</span>
                                <span style="font-weight: 600; color: var(--primary);">
                                    Gs. ${new Intl.NumberFormat('es-PY').format(ingresoTotal)}
                                </span>
                            </div>
                            
                            <!-- Fila 2: Distribución 70/30 -->
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                <div>
                                    <span style="color: var(--text);">Distribución:</span>
                                    <div style="font-size: 0.85em; color: var(--text-light); margin-top: 2px;">
                                        70% Empresa / 30% Transportista
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-weight: 600; color: #059669;">
                                        Gs. ${new Intl.NumberFormat('es-PY').format(baseEmpresa)}
                                    </div>
                                    <div style="font-size: 0.85em; color: #d97706;">
                                        Gs. ${new Intl.NumberFormat('es-PY').format(pagoTransportista)}
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Fila 3: Gastos de la empresa -->
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                <span style="color: var(--text);">Gastos de la empresa:</span>
                                <span style="font-weight: 600; color: ${gastosViaje > 0 ? '#d97706' : '#059669'};">
                                    Gs. ${new Intl.NumberFormat('es-PY').format(gastosViaje)}
                                </span>
                            </div>
                            
                            <!-- Fila 4: Utilidad neta empresa -->
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; background: #ecfdf5; border-radius: 4px; margin-top: 5px;">
                                <span style="color: var(--text); font-weight: 600;">Utilidad neta empresa:</span>
                                <span style="font-weight: 700; color: ${utilidadNetaEmpresa >= 0 ? '#059669' : '#dc2626'};">
                                    Gs. ${new Intl.NumberFormat('es-PY').format(utilidadNetaEmpresa)}
                                </span>
                            </div>
                            
                            <!-- Fila 5: Utilidad transportista -->
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; background: #fef3c7; border-radius: 4px; margin-top: 5px;">
                                <span style="color: var(--text); font-weight: 600;">Utilidad transportista:</span>
                                <span style="font-weight: 700; color: #d97706;">
                                    Gs. ${new Intl.NumberFormat('es-PY').format(pagoTransportista)}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- DETALLE DE GASTOS -->
                    ${gastosViaje > 0 ? `
                        <div style="margin-top: 15px;">
                            <div style="font-size: 0.9em; color: var(--text-light); margin-bottom: 5px;">
                                <i class="fas fa-receipt"></i> Gastos detallados de la empresa:
                            </div>
                            <div style="font-size: 0.85em; color: var(--text-light); padding-left: 20px;">
                                ${gastosDetallados[viaje.id_envio].map(g => 
                                    `• ${g.descripcion}: Gs. ${new Intl.NumberFormat('es-PY').format(g.monto)}`
                                ).join('<br>')}
                            </div>
                        </div>
                    ` : `
                        <div style="margin-top: 15px; text-align: center; color: #059669; font-size: 0.9em; padding: 10px; background: #ecfdf5; border-radius: 8px;">
                            <i class="fas fa-check-circle"></i> No hay gastos registrados para este viaje
                        </div>
                    `}
                </div>
            </div>
        `;
    });
    
    contenedor.innerHTML = html;
}
dividirTexto(texto, maxCaracteres) {
    if (!texto) return [''];
    if (texto.length <= maxCaracteres) return [texto];
    
    const palabras = texto.split(' ');
    const lineas = [];
    let lineaActual = '';
    
    for (let palabra of palabras) {
        if ((lineaActual + ' ' + palabra).length <= maxCaracteres) {
            lineaActual += (lineaActual ? ' ' : '') + palabra;
        } else {
            if (lineaActual) lineas.push(lineaActual);
            lineaActual = palabra;
        }
    }
    
    if (lineaActual) lineas.push(lineaActual);
    
    if (lineas.length === 1 && lineas[0].length > maxCaracteres) {
        return [
            texto.substring(0, maxCaracteres - 3) + '...',
            texto.substring(maxCaracteres - 3)
        ];
    }
    
    return lineas;
}

    actualizarTransportistaEnLista(data) {
    }
    
async cargarGastosFijos() {
    try {
        const token = localStorage.getItem('adminToken');
        const fecha = new Date();
        const mes = fecha.getMonth() + 1;
        const año = fecha.getFullYear();
        
        const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-fijos?mes=${mes}&año=${año}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const totalGastos = data.total_gastos_fijos || 0;
            document.getElementById('gastosFijosResumen').textContent = this.formatearGuaranies(totalGastos);
            
            await this.calcularMetricasLocales();
            
            return totalGastos;
        }
        return 0;
    } catch (error) {
        console.error('Error cargando gastos fijos:', error);
        return 0;
    }
}

abrirModalGasto() {
    const modal = document.getElementById('modalGastoFijo');
    if (modal) {
        modal.style.display = 'flex';
        this.cargarGastosFijosEnModal();
    }
}

cerrarModalGasto() {
    const modal = document.getElementById('modalGastoFijo');
    if (modal) {
        modal.style.display = 'none';
    }
    const form = document.getElementById('formGastoFijoModal');
    if (form) form.reset();
}

async cargarGastosFijosEnModal() {
    try {
        const token = localStorage.getItem('adminToken');
        const fecha = new Date();
        const mes = fecha.getMonth() + 1;
        const año = fecha.getFullYear();
        
        const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-fijos?mes=${mes}&año=${año}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            this.mostrarGastosFijosEnModal(data.gastos || []);
        }
    } catch (error) {
        console.error('Error cargando gastos fijos:', error);
    }
}

mostrarGastosFijosEnModal(gastos) {
    const tbody = document.getElementById('tablaGastosFijosModalBody');
    if (!tbody) return;
    
    const gastosOrdenados = [...gastos].sort((a, b) => parseFloat(b.monto) - parseFloat(a.monto));
    
    const getCategoriaClass = (cat) => {
        const clases = {
            'salarios': 'categoria-salarios', 'alquiler': 'categoria-alquiler',
            'servicios': 'categoria-servicios', 'combustible': 'categoria-combustible',
            'mantenimiento': 'categoria-mantenimiento', 'limpieza': 'categoria-limpieza',
            'seguros': 'categoria-seguros', 'impuestos': 'categoria-impuestos',
            'otros': 'categoria-otros'
        };
        return clases[cat] || 'categoria-otros';
    };
    
    const getCategoriaTexto = (cat) => {
        const textos = {
            'salarios': '💰 Salarios', 'alquiler': '🏢 Alquiler',
            'servicios': '💡 Servicios', 'combustible': '⛽ Combustible',
            'mantenimiento': '🔧 Mantenimiento', 'limpieza': '🧹 Limpieza',
            'seguros': '🛡️ Seguros', 'impuestos': '📄 Impuestos',
            'otros': '📦 Otros'
        };
        return textos[cat] || cat;
    };
    
    const formatFecha = (fechaStr) => {
    if (!fechaStr) return 'Sin fecha';
    const partes = fechaStr.split('T')[0].split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const fecha = new Date(fechaStr);
    const dia = fecha.getDate().toString().padStart(2, '0');
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const año = fecha.getFullYear();
    return `${dia}/${mes}/${año}`;
};
    
    if (!gastosOrdenados || gastosOrdenados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px;">📭 No hay gastos fijos registrados este mes</td></tr>`;
        return;
    }
    
    tbody.innerHTML = gastosOrdenados.map(g => `
        <tr>
            <td>${this.escapeHtml(g.descripcion)}</td>
            <td><span class="categoria-badge ${getCategoriaClass(g.categoria)}">${getCategoriaTexto(g.categoria)}</span></td>
            <td style="text-align: right; font-weight: 600;">${this.formatearGuaranies(g.monto)}</td>
            <td style="text-align: center;">${formatFecha(g.fecha)}</td>
            <td style="text-align: center;">${g.periodicidad || 'mensual'}</td>
            <td style="text-align: center;">
                <button class="btn-gasto-editar" onclick="panelEmpresas.editarGastoFijo(${g.id_gasto_fijo})"><i class="fas fa-edit"></i></button>
                <button class="btn-gasto-eliminar" onclick="panelEmpresas.eliminarGastoFijo(${g.id_gasto_fijo})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

async agregarGastoFijoModal(event) {
    event.preventDefault();
    const descripcion = document.getElementById('gastoDescripcionModal').value;
    const categoria = document.getElementById('gastoCategoriaModal').value;
    let monto = document.getElementById('gastoMontoModal').value;
    const fecha = document.getElementById('gastoFechaModal').value;
    const periodicidad = document.getElementById('gastoPeriodicidadModal').value;
    const idGasto = document.getElementById('gastoFijoIdModal').value;  
    
    if (!descripcion || !monto || !fecha) {
        alert('Completa todos los campos requeridos');
        return;
    }
    
    const montoLimpio = monto.replace(/\./g, '');
    const montoNumerico = parseFloat(montoLimpio);
    
    if (isNaN(montoNumerico) || montoNumerico <= 0) {
        alert('Ingresa un monto válido');
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        
        let url, method;
        if (idGasto) {
            url = `${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-fijos/${idGasto}`;
            method = 'PUT';
            console.log('✏️ Actualizando gasto ID:', idGasto);
        } else {
            url = `${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-fijos`;
            method = 'POST';
            console.log('➕ Creando nuevo gasto');
        }
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ descripcion, categoria, monto: montoNumerico, fecha: fecha, periodicidad })
        });
        
        if (response.ok) {
            await this.cargarGastosFijosEnModal();
            await this.cargarGastosFijos();
            this.mostrarNotificacion(idGasto ? 'Gasto actualizado' : 'Gasto agregado');
            document.getElementById('formGastoFijoModal').reset();
            document.getElementById('gastoFijoIdModal').value = '';  
            const submitBtn = document.querySelector('#formGastoFijoModal button[type="submit"]');
            if (submitBtn) submitBtn.textContent = 'Guardar Gasto';
            this.cerrarModalGasto();
        } else {
            const error = await response.json();
            alert('Error: ' + (error.message || 'No se pudo guardar'));
        }
    } catch (error) {
        console.error(error);
        alert('Error al guardar');
    }
}

async eliminarGastoFijo(idGasto) {
    if (!confirm('¿Eliminar este gasto fijo?')) return;
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-fijos/${idGasto}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            await this.cargarGastosFijosEnModal();
            await this.cargarGastosFijos();
            this.mostrarNotificacion('Gasto eliminado');
        } else {
            alert('Error al eliminar');
        }
    } catch (error) {
        console.error(error);
        alert('Error al eliminar');
    }
}

async editarGastoFijo(idGasto) {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${this.BASE_URL}/empresas/${this.ID_EMPRESA}/gastos-fijos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            const gasto = data.gastos.find(g => g.id_gasto_fijo === idGasto);
            if (gasto) {
                document.getElementById('gastoDescripcionModal').value = gasto.descripcion;
                document.getElementById('gastoCategoriaModal').value = gasto.categoria;
                const montoFormateado = parseInt(gasto.monto).toLocaleString('es-PY');
                document.getElementById('gastoMontoModal').value = montoFormateado;
                
                const fechaObj = new Date(gasto.fecha);
                const año = fechaObj.getFullYear();
                const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
                const dia = String(fechaObj.getDate()).padStart(2, '0');
                document.getElementById('gastoFechaModal').value = `${año}-${mes}-${dia}`;
                
                document.getElementById('gastoPeriodicidadModal').value = gasto.periodicidad;
                document.getElementById('gastoFijoIdModal').value = gasto.id_gasto_fijo;
                
                const submitBtn = document.querySelector('#formGastoFijoModal button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Actualizar Gasto';
                
                this.abrirModalGasto();
            }
        }
    } catch (error) {
        console.error(error);
        alert('Error al cargar el gasto para editar');
    }
}
configurarEventListenersGastos() {
    const card = document.getElementById('cardGastosFijos');
    if (card) {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            this.abrirModalGasto();
        });
    }
    
    const btnCerrar = document.getElementById('btnCerrarModal');
    const btnCancelar = document.getElementById('btnCancelarModalGastos');
    const form = document.getElementById('formGastoFijoModal');
    const modal = document.getElementById('modalGastoFijo');
    
    if (btnCerrar) btnCerrar.onclick = () => this.cerrarModalGasto();
    if (btnCancelar) btnCancelar.onclick = () => this.cerrarModalGasto();
    if (form) form.onsubmit = (e) => this.agregarGastoFijoModal(e);
    if (modal) modal.onclick = (e) => { if (e.target === modal) this.cerrarModalGasto(); };
}

escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
configurarFormatoMonto() {
    const inputMonto = document.getElementById('gastoMontoModal');
    if (!inputMonto) return;
        inputMonto.type = 'text';
    inputMonto.placeholder = '0';
    
    inputMonto.addEventListener('input', (e) => {
        let valor = e.target.value.replace(/[^0-9]/g, '');
        if (valor === '') {
            e.target.value = '';
            return;
        }
        const numero = parseInt(valor, 10);
        const formateado = numero.toLocaleString('es-PY');
        e.target.value = formateado;
    });
    
    inputMonto.addEventListener('focus', (e) => {
        let valor = e.target.value.replace(/\./g, '');
        if (valor === '') return;
        const numero = parseInt(valor, 10);
        if (!isNaN(numero)) {
            e.target.value = numero.toLocaleString('es-PY');
        }
    });
}

} 

document.addEventListener('DOMContentLoaded', function() {
    window.panelEmpresas = new PanelEmpresas();
    
});

