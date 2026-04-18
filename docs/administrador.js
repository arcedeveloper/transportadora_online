console.log('Panel de administración - Cargado');
function getEmpresaId() {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
        try {
            const user = JSON.parse(userData);
            if (user.empresa_id) {
                return user.empresa_id;
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }
    
    console.warn('No se pudo obtener empresa_id, usando valor por defecto 1');
    return 1;
}
function getEmpresaNombre() {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
        try {
            const user = JSON.parse(userData);
            if (user.empresa_nombre) {
                return user.empresa_nombre;
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }
    
    const empresaGuardada = localStorage.getItem('empresa_seleccionada');
    if (empresaGuardada) {
        try {
            const empresa = JSON.parse(empresaGuardada);
            if (empresa.nombre_empresa) {
                return empresa.nombre_empresa;
            }
        } catch (e) {
            console.error('Error parsing empresa data:', e);
        }
    }
    
    return 'Mi Empresa';
}

const adminToken = localStorage.getItem('adminToken');
const isAuthenticated = localStorage.getItem('adminAuthenticated');
const empresaId = getEmpresaId();
const empresaNombre = getEmpresaNombre();

console.log('🏢 Empresa del usuario:', empresaId, '-', empresaNombre);

if (!adminToken || !isAuthenticated) {
    console.log('No hay token o usuario no autenticado');
    alert('Debes iniciar sesión para acceder al panel de administración');
    window.location.href = 'login-admin.html';
    throw new Error('Usuario no autenticado');
}

console.log('Usuario autenticado, token disponible');
const API_BASE = 'https://transportadoraonline-production.up.railway.app/api/admin';

let currentTab = 'dashboard';
let charts = {};
function inicializarInfoEmpresa() {
    const empresaNombre = getEmpresaNombre();
    
    const headerTitle = document.getElementById('headerTitulo');
    if (headerTitle) {
        headerTitle.innerHTML = `<i class="fas fa-building"></i> Panel Administrativo - ${empresaNombre}`;
    }
    
    console.log('🏢 Empresa actual:', empresaNombre);
}

function actualizarHeaderUsuario() {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
        try {
            const user = JSON.parse(userData);
            const userNameElement = document.getElementById('userName');
            const userAvatarElement = document.getElementById('userAvatar');
            
            if (userNameElement && user.correo) {
                userNameElement.textContent = user.correo.split('@')[0];
            }
            
            if (userAvatarElement) {
                userAvatarElement.innerHTML = `<i class="fas fa-user-shield"></i>`;
            }
        } catch (e) {
            console.error('Error updating user header:', e);
        }
    }
}
async function fetchData(url, options = {}) {
    try {
        const token = localStorage.getItem('adminToken');
        
        console.log('🌐 Haciendo request a:', url);
        
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...options.headers
            }
        };

        if (options.body) {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, config);
        console.log('📡 Status:', response.status);
        
        if (response.status === 401) {
            showNotification('Sesión expirada. Redirigiendo al login...', 'error');
            setTimeout(() => logout(), 2000);
            return null;
        }
        
        if (response.status === 403) {
            showNotification('🚫 No tienes permisos para acceder a estos datos', 'error');
            return null;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        return data;
        
    } catch (error) {
        console.error('Error en fetchData:', error);
        showNotification('Error de conexión con el servidor', 'error');
        return null;
    }
}
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    notification.style.background = colors[type] || colors.info;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}-circle"></i>
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}
function showTab(tabName, element) {
    console.log('Cambiando a pestaña:', tabName);
    
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.style.display = 'block';
    }
    
    if (element) {
        element.classList.add('active');
    }
    
    currentTab = tabName;
    
    switch(tabName) {
        case 'dashboard':
            cargarDashboard();
            break;
        case 'usuarios':
            cargarUsuarios();
            break;
        case 'transportistas':
            cargarTransportistas();
            break;
        case 'reportes':
            cargarReportes();
            break;
        case 'pedidos':
            cargarPedidos();
            break;
    }
}
async function cargarDashboard() {
    console.log('Cargando dashboard...');

    try {
        const data = await fetchData(`${API_BASE}/dashboard`);

        if (data && data.success) {
            console.log('✅ Dashboard cargado:', data.stats);
            document.getElementById('totalUsuarios').textContent = data.stats.totalUsuarios || 0;
            document.getElementById('totalTransportistas').textContent = data.stats.totalTransportistas || 0;
            document.getElementById('totalPedidos').textContent = data.stats.totalPedidos || 0;
            document.getElementById('pedidosPendientes').textContent = data.stats.pedidosPendientes || 0;
            document.getElementById('pedidosEntregados').textContent = data.stats.pedidosEntregados || 0;
            const ingresosNetos = await calcularIngresosNetosReales();

            document.getElementById('ingresosTotales').textContent = formatearGuaranies(ingresosNetos);
            console.log('💰 Ingreso neto mostrado:', ingresosNetos);

        } else {
            console.error('❌ Error cargando dashboard');
            showNotification('Error al cargar el dashboard', 'error');
            document.getElementById('ingresosTotales').textContent = formatearGuaranies(0);
        }

    } catch (error) {
        console.error('Error en cargarDashboard:', error);
        showNotification('Error de conexión con el servidor', 'error');
        document.getElementById('ingresosTotales').textContent = formatearGuaranies(0);
    }
}

async function calcularIngresosNetosReales() {
    try {
        console.log('💰 Calculando ingresos netos EXACTOS (igual que empresa)...');
        const pedidosData = await fetchData(`${API_BASE}/pedidos`);
        if (!pedidosData || !pedidosData.success) {
            console.log('❌ No se pudieron cargar los pedidos');
            return 0;
        }

        const todosLosPedidos = pedidosData.pedidos || [];
        console.log(`📦 Total de pedidos: ${todosLosPedidos.length}`);

        const pedidosEntregados = todosLosPedidos.filter(pedido => 
            pedido.estado_envio?.toUpperCase() === 'ENTREGADO' || 
            pedido.estado?.toUpperCase() === 'ENTREGADO'
        );

        console.log(`✅ Pedidos ENTREGADOS: ${pedidosEntregados.length}`);

        if (pedidosEntregados.length === 0) return 0;

        let ingresosBrutosTotal = 0;
        pedidosEntregados.forEach(pedido => {
            const costo = parseFloat(pedido.costo) || 0;
            ingresosBrutosTotal += costo;
        });

        console.log(`💰 INGRESOS BRUTOS TOTAL: ${ingresosBrutosTotal}`);
        console.log(`💰 70% DE INGRESOS BRUTOS: ${ingresosBrutosTotal * 0.7}`);
        let totalGastos = 0;
        const idsEnviosEntregados = pedidosEntregados
            .map(pedido => pedido.id_envio)
            .filter(id => id && id !== 'null' && id !== 0);

        if (idsEnviosEntregados.length > 0) {
            try {
                const token = localStorage.getItem('adminToken');
                const empresaId = getEmpresaId();
                
                const response = await fetch(`https://transportadoraonline-production.up.railway.app/api/empresas/${empresaId}/gastos-detallados`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ ids_envios: idsEnviosEntregados })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.gastos_detallados) {
                        Object.values(data.gastos_detallados).forEach(gastosArray => {
                            if (Array.isArray(gastosArray)) {
                                gastosArray.forEach(gasto => {
                                    const monto = parseFloat(gasto.monto) || 0;
                                    totalGastos += monto;
                                });
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('❌ Error llamando endpoint de gastos variables:', error);
            }
        }

        try {
            const token = localStorage.getItem('adminToken');
            const empresaId = getEmpresaId();
            const fecha = new Date();
            const mes = fecha.getMonth() + 1;
            const año = fecha.getFullYear();
            
            const response = await fetch(`https://transportadoraonline-production.up.railway.app/api/empresas/${empresaId}/gastos-fijos?mes=${mes}&año=${año}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                const gastosFijos = data.total_gastos_fijos || 0;
                totalGastos += gastosFijos;
                console.log(`💰 GASTOS FIJOS del mes: ${gastosFijos}`);
            }
        } catch (error) {
            console.error('❌ Error cargando gastos fijos:', error);
        }

        console.log(`💸 TOTAL GASTOS (variables + fijos): ${totalGastos}`);

        const ingresoNetoEmpresa = (ingresosBrutosTotal * 0.7) - totalGastos;

        console.log('🎯 RESUMEN FINAL EXACTO:');
        console.log(`📈 Ingresos brutos: ${ingresosBrutosTotal}`);
        console.log(`💰 70% de ingresos brutos: ${ingresosBrutosTotal * 0.7}`);
        console.log(`💸 Total gastos: ${totalGastos}`);
        console.log(`📊 INGRESO NETO EMPRESA (70% - gastos): ${ingresoNetoEmpresa}`);

        return ingresoNetoEmpresa;

    } catch (error) {
        console.error('❌ Error calculando ingresos netos:', error);
        return 0;
    }
}

function formatearGuaranies(monto) {
    if (!monto || monto === 0) return 'Gs. 0';
    const montoFormateado = parseFloat(monto).toLocaleString('es-PY', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    return `Gs. ${montoFormateado}`;
}
async function cargarUsuarios() {
    console.log('👥 Cargando usuarios de la empresa...');
    
    const rol = document.getElementById('filtroRol')?.value;
    const busqueda = document.getElementById('buscarUsuario')?.value;
    
    let url = `${API_BASE}/usuarios`;
    const params = new URLSearchParams();
    
    if (rol) params.append('rol', rol);
    if (busqueda) params.append('busqueda', busqueda);
    
    if (params.toString()) {
        url += `?${params.toString()}`;
    }
    
    console.log('🔍 URL de búsqueda:', url);
    
    const data = await fetchData(url);
    
    if (data && data.success) {
        console.log(`✅ ${data.usuarios.length} usuarios cargados`);
        
        const tbody = document.getElementById('tablaUsuarios');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (data.usuarios.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #666;">
                        <i class="fas fa-search"></i> No se encontraron usuarios con los filtros aplicados
                    </td>
                </tr>
            `;
            return;
        }
        
        data.usuarios.forEach(usuario => {
            const tr = document.createElement('tr');
            let nombreRol = 'Usuario';
            switch(usuario.id_rol) {
                case 1:
                    nombreRol = 'Administrador';
                    break;
                case 2:
                    nombreRol = 'Transportista';
                    break;
                default:
                    nombreRol = usuario.rol || 'Usuario';
            }
            
            const estado = usuario.activo === 1 ? 
                '<span class="status-badge status-active">Activo</span>' : 
                '<span class="status-badge status-inactive">Bloqueado</span>';
            
            const btnAccion = usuario.activo === 1 ? 
                `<button class="btn btn-danger btn-sm" onclick="bloquearUsuario(${usuario.id_usuario})">
                    <i class="fas fa-ban"></i> Bloquear
                </button>` :
                `<button class="btn btn-success btn-sm" onclick="activarUsuario(${usuario.id_usuario})">
                    <i class="fas fa-check"></i> Activar
                </button>`;
            
            tr.innerHTML = `
                <td>${usuario.id_usuario}</td>
                <td>
                    <strong>${usuario.correo}</strong>
                    ${usuario.nombre_completo && usuario.nombre_completo !== 'Administrador' ? 
                        `<br><small style="color: #666;">${usuario.nombre_completo}</small>` : ''}
                </td>
                <td>
                    <span class="status-badge ${nombreRol === 'Administrador' ? 'status-active' : 
                                           nombreRol === 'Transportista' ? 'status-pending' : 
                                           'status-inactive'}">
                        ${nombreRol}
                    </span>
                </td>
                <td>${estado}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${btnAccion}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } else {
        console.error('❌ Error cargando usuarios');
        const tbody = document.getElementById('tablaUsuarios');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #ef4444;">
                        <i class="fas fa-exclamation-triangle"></i> Error cargando usuarios
                        <br>
                        <button class="btn btn-primary btn-sm" onclick="cargarUsuarios()" style="margin-top: 0.5rem;">
                            <i class="fas fa-refresh"></i> Reintentar
                        </button>
                    </td>
                </tr>
            `;
        }
    }
}

function limpiarFiltros() {
    document.getElementById('filtroRol').value = '';
    document.getElementById('buscarUsuario').value = '';
    cargarUsuarios();
    showNotification('Filtros limpiados', 'info');
}

async function bloquearUsuario(id) {
    if (confirm('¿Estás seguro de bloquear este usuario?')) {
        const data = await fetchData(`${API_BASE}/usuarios/${id}/bloquear`, { 
            method: 'POST' 
        });
        
        if (data && data.success) {
            showNotification('Usuario bloqueado exitosamente', 'success');
            cargarUsuarios();
        } else {
            showNotification('Error al bloquear usuario', 'error');
        }
    }
}

async function activarUsuario(id) {
    if (confirm('¿Estás seguro de activar este usuario?')) {
        const data = await fetchData(`${API_BASE}/usuarios/${id}/activar`, { 
            method: 'POST' 
        });
        
        if (data && data.success) {
            showNotification('✅ Usuario activado exitosamente', 'success');
            cargarUsuarios();
        } else {
            showNotification('❌ Error al activar usuario', 'error');
        }
    }
}

async function cargarEmpresasParaTransportista() {
    try {
        console.log('🏢 Cargando empresas disponibles...');
        
        const response = await fetch('https://transportadoraonline-production.up.railway.app/api/auth/empresas-activas');
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();

        if (data.success && data.empresas && data.empresas.length > 0) {
            let optionsHTML = '<option value="">Empresa de afiliación</option>';
            
            data.empresas.forEach(empresa => {
                optionsHTML += `
                    <option value="${empresa.id}">
                        ${empresa.nombre_empresa} (${empresa.ruc || 'Sin RUC'})
                    </option>
                `;
            });
            
            console.log(`✅ ${data.empresas.length} empresas cargadas`);
            return optionsHTML;
        } else {
            console.warn('No hay empresas disponibles');
            return '<option value="">No hay empresas disponibles</option>';
        }
    } catch (error) {
        console.error('Error cargando empresas:', error);
        return '<option value="">Error al cargar empresas</option>';
    }
}

function mostrarModalCrearTransportista() {
    cargarEmpresasParaTransportista().then(empresasHTML => {
        const modalHTML = `
            <div id="modalTransportista" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 2rem;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow-y: auto;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h2 style="font-weight: 600;"><i class="fas fa-plus"></i> Nuevo Transportista</h2>
                        <button onclick="cerrarModal()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
                    </div>
                    
                    <form id="formTransportista" onsubmit="crearTransportista(event)">
                        <div style="display: grid; gap: 1rem;">
                            <!-- Selección de Empresa -->
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Empresa *</label>
                                <select id="empresaTransportista" required style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                                    ${empresasHTML}
                                </select>
                            </div>
                            
                            <!-- Información Personal -->
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Nombre Completo *</label>
                                <input type="text" id="nombreTransportista" required style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Cédula *</label>
                                <input type="text" id="cedulaTransportista" required style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Teléfono</label>
                                <input type="tel" id="telefonoTransportista" style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                            </div>
                            
                            <!-- Información de Cuenta -->
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Correo Electrónico *</label>
                                <input type="email" id="correoTransportista" required style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Contraseña *</label>
                                <input type="password" id="passwordTransportista" required style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                            </div>
                            
                            <!-- Información del Vehículo -->
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Licencia de Conducir *</label>
                                <input type="text" id="licenciaTransportista" required style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Vehículo *</label>
                                <input type="text" id="vehiculoTransportista" required style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;" placeholder="Ej: Toyota Hilux, JMC, etc.">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Capacidad Máxima (kg)</label>
                                <input type="text" id="pesoMaximoTransportista" style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;" placeholder="Ej: 5000">
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                            <button type="button" onclick="cerrarModal()" class="btn btn-outline" style="flex: 1;">Cancelar</button>
                            <button type="submit" class="btn btn-primary" style="flex: 1;">
                                <i class="fas fa-save"></i> Crear Transportista
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }).catch(error => {
        console.error('Error cargando empresas:', error);
        showNotification('Error al cargar la lista de empresas', 'error');
    });
}

function cerrarModal() {
    const modal = document.getElementById('modalTransportista');
    if (modal) {
        modal.remove();
    }
}

async function crearTransportista(event) {
    event.preventDefault();
    
    const empresaId = document.getElementById('empresaTransportista').value;
    
    if (!empresaId) {
        showNotification('❌ Debes seleccionar una empresa', 'error');
        return;
    }
    
    const transportistaData = {
        nombre: document.getElementById('nombreTransportista').value,
        cedula: document.getElementById('cedulaTransportista').value,
        telefono: document.getElementById('telefonoTransportista').value,
        correo: document.getElementById('correoTransportista').value,
        contraseña: document.getElementById('passwordTransportista').value,
        licencia: document.getElementById('licenciaTransportista').value,
        vehiculo: document.getElementById('vehiculoTransportista').value,
        peso_maximo: document.getElementById('pesoMaximoTransportista').value,
        empresa_id: parseInt(empresaId) 
    };
    
    console.log('📝 Creando transportista:', transportistaData);
    
    const data = await fetchData(`${API_BASE}/transportistas`, {
        method: 'POST',
        body: transportistaData
    });
    
    if (data && data.success) {
        showNotification('✅ Transportista creado exitosamente', 'success');
        cerrarModal();
        cargarTransportistas();
    } else {
        showNotification(data?.message || 'Error al crear transportista', 'error');
    }
}

async function cargarTransportistas() {
    console.log('Cargando transportistas de la empresa...');
    
    const data = await fetchData(`${API_BASE}/transportistas`);
    
    if (data && data.success) {
        console.log(`✅ ${data.transportistas.length} transportistas cargados`);
        
        const tbody = document.getElementById('tablaTransportistas');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (data.transportistas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #666;">
                        <i class="fas fa-truck"></i> No hay transportistas registrados
                        <br>
                        <button class="btn btn-primary" onclick="mostrarModalCrearTransportista()" style="margin-top: 1rem;">
                            <i class="fas fa-plus"></i> Agregar Primer Transportista
                        </button>
                    </td>
                </tr>
            `;
            return;
        }
        
        data.transportistas.forEach(transportista => {
            const tr = document.createElement('tr');
            const estado = transportista.estado === 'Libre' ? 
                '<span class="status-badge status-active">Libre</span>' : 
                '<span class="status-badge status-inactive">Ocupado</span>';
            
            tr.innerHTML = `
                <td>${transportista.id_transportista}</td>
                <td>
                    <strong>${transportista.nombre}</strong><br>
                    <small style="color: #666;">${transportista.correo || 'N/A'}</small>
                </td>
                <td>${transportista.cedula || 'N/A'}</td>
                <td>
                    ${transportista.vehiculo || 'N/A'}<br>
                    <small style="color: #666;">Lic: ${transportista.licencia || 'N/A'}</small>
                </td>
                <td>${transportista.telefono || 'N/A'}</td>
                <td>${estado}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn btn-outline btn-sm" onclick="editarTransportista(${transportista.id_transportista})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="eliminarTransportista(${transportista.id_transportista})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
    } else {
        console.error('❌ Error cargando transportistas');
        const tbody = document.getElementById('tablaTransportistas');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">
                        <i class="fas fa-exclamation-triangle"></i> Error cargando transportistas
                    </td>
                </tr>
            `;
        }
    }
}

async function editarTransportista(id) {
    console.log(`✏️ Editando transportista ID: ${id}`);
    
    const data = await fetchData(`${API_BASE}/transportistas/${id}`);
    
    if (data && data.success) {
        mostrarModalEditarTransportista(data.transportista);
    } else {
        showNotification('Error al cargar datos del transportista', 'error');
    }
}
function mostrarModalEditarTransportista(transportista) {
    const modalHTML = `
        <div id="modalEditarTransportista" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        ">
            <div style="
                background: white;
                padding: 2rem;
                border-radius: 12px;
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow-y: auto;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h2 style="font-weight: 600;"><i class="fas fa-edit"></i> Editar Transportista</h2>
                    <button onclick="cerrarModalEditar()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
                </div>
                
                <form id="formEditarTransportista" onsubmit="actualizarTransportista(event, ${transportista.id_transportista})">
                    <div style="display: grid; gap: 1rem;">
                        <!-- Información Personal -->
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Nombre Completo *</label>
                            <input type="text" id="editNombreTransportista" value="${transportista.nombre || ''}" required 
                                style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Cédula *</label>
                            <input type="text" id="editCedulaTransportista" value="${transportista.cedula || ''}" required 
                                style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Teléfono</label>
                            <input type="tel" id="editTelefonoTransportista" value="${transportista.telefono || ''}" 
                                style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                        </div>
                        
                        <!-- Información del Vehículo -->
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Licencia de Conducir *</label>
                            <input type="text" id="editLicenciaTransportista" value="${transportista.licencia || ''}" required 
                                style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Vehículo *</label>
                            <input type="text" id="editVehiculoTransportista" value="${transportista.vehiculo || ''}" required 
                                style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;" 
                                placeholder="Ej: Toyota Hilux, JMC, etc.">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Capacidad Máxima (kg)</label>
                            <input type="text" id="editPesoMaximoTransportista" value="${transportista.peso_maximo || ''}" 
                                style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;" 
                                placeholder="Ej: 5000">
                        </div>
                        
                        <!-- Estado -->
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Estado</label>
                            <select id="editEstadoTransportista" style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 6px;">
                                <option value="Libre" ${transportista.estado === 'Libre' ? 'selected' : ''}>Libre</option>
                                <option value="ocupado" ${transportista.estado === 'ocupado' ? 'selected' : ''}>Ocupado</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button type="button" onclick="cerrarModalEditar()" class="btn btn-outline" style="flex: 1;">Cancelar</button>
                        <button type="submit" class="btn btn-primary" style="flex: 1;">
                            <i class="fas fa-save"></i> Actualizar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function cerrarModalEditar() {
    const modal = document.getElementById('modalEditarTransportista');
    if (modal) {
        modal.remove();
    }
}

async function actualizarTransportista(event, id) {
    event.preventDefault();
    
    const transportistaData = {
        nombre: document.getElementById('editNombreTransportista').value,
        cedula: document.getElementById('editCedulaTransportista').value,
        telefono: document.getElementById('editTelefonoTransportista').value,
        licencia: document.getElementById('editLicenciaTransportista').value,
        vehiculo: document.getElementById('editVehiculoTransportista').value,
        peso_maximo: document.getElementById('editPesoMaximoTransportista').value,
        estado: document.getElementById('editEstadoTransportista').value
    };
    
    console.log('📝 Actualizando transportista:', id, transportistaData);
    
    const data = await fetchData(`${API_BASE}/transportistas/${id}`, {
        method: 'PUT',
        body: transportistaData
    });
    
    if (data && data.success) {
        showNotification('Transportista actualizado exitosamente', 'success');
        cerrarModalEditar();
        cargarTransportistas();
    } else {
        showNotification(data?.message || 'Error al actualizar transportista', 'error');
    }
}

async function eliminarTransportista(id) {
    if (confirm('¿Estás seguro de eliminar este transportista? Esta acción también eliminará su cuenta de usuario.')) {
        const data = await fetchData(`${API_BASE}/transportistas/${id}`, {
            method: 'DELETE'
        });
        
        if (data && data.success) {
            showNotification('Transportista eliminado exitosamente', 'success');
            cargarTransportistas();
        } else {
            showNotification('Error al eliminar transportista', 'error');
        }
    }
}

async function cargarPedidos() {
    console.log('📦 Cargando pedidos de la empresa...');
    
    const data = await fetchData(`${API_BASE}/pedidos`);
    
    if (data && data.success) {
        console.log(`✅ ${data.pedidos.length} pedidos cargados`);
        
        const tbody = document.getElementById('tablaPedidos');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (data.pedidos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 2rem; color: #666;">
                        <i class="fas fa-box-open"></i> No hay pedidos registrados
                    </td>
                </tr>
            `;
            return;
        }
        
        data.pedidos.forEach(pedido => {
            const tr = document.createElement('tr');
            
            let estadoBadge = '';
            if (pedido.estado_envio === 'ENTREGADO') {
                estadoBadge = '<span class="status-badge status-active">Entregado</span>';
            } else if (pedido.estado_envio === 'Pendiente') {
                estadoBadge = '<span class="status-badge status-pending">Pendiente</span>';
            } else {
                estadoBadge = '<span class="status-badge status-inactive">En proceso</span>';
            }
            
            const fecha = new Date(pedido.fecha_creacion).toLocaleDateString('es-PY');
            const costo = pedido.costo ? formatearGuaranies(pedido.costo) : 'N/A';
            const tipoCargaClass = pedido.tipo_carga ? 
                pedido.tipo_carga.toLowerCase().replace(/\s+/g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "") : 
                'default';
            
            tr.innerHTML = `
                <td>${pedido.id_pedido}</td>
                <td>${pedido.descripcion || 'Sin descripción'}</td>
                <td>
                    <span class="tipo-carga-badge ${tipoCargaClass}">
                        ${pedido.tipo_carga || 'N/A'}
                    </span>
                </td>
                <td>${costo}</td>
                <td>${pedido.cliente_correo || 'N/A'}</td>
                <td>${getEmpresaNombre()}</td>
                <td>${pedido.transportista_nombre || 'Sin asignar'}</td>
                <td>${estadoBadge}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <select class="filter-select" onchange="cambiarEstadoPedido(${pedido.id_pedido}, this.value)" style="font-size: 0.75rem; min-width: 120px;">
                            <option value="">Cambiar estado</option>
                            <option value="Pendiente" ${pedido.estado_envio === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                            <option value="ENTREGADO" ${pedido.estado_envio === 'ENTREGADO' ? 'selected' : ''}>Entregado</option>
                        </select>
                        <button class="btn btn-danger btn-sm" onclick="eliminarPedido(${pedido.id_pedido})" title="Eliminar pedido">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
                cargarEstadisticasPedidos();
        showNotification(`${data.pedidos.length} pedidos cargados`, 'success');
        
    } else {
        console.error('❌ Error cargando pedidos');
        const tbody = document.getElementById('tablaPedidos');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">
                        <i class="fas fa-exclamation-triangle"></i> Error cargando pedidos
                    </td>
                </tr>
            `;
        }
    }
}
async function cambiarEstadoPedido(idPedido, nuevoEstado) {
    if (!nuevoEstado) return;
    
    if (confirm(`¿Cambiar estado del pedido #${idPedido} a "${nuevoEstado}"?`)) {
        const data = await fetchData(`${API_BASE}/pedidos/${idPedido}/estado`, {
            method: 'PUT',
            body: { estado: nuevoEstado }
        });
        
        if (data && data.success) {
            showNotification(data.message, 'success');
            cargarPedidos();
        } else {
            showNotification('Error al cambiar estado', 'error');
        }
    }
}

async function cargarEstadisticasPedidos() {
    console.log('📊 Cargando estadísticas de pedidos...');
    
    const data = await fetchData(`${API_BASE}/pedidos/estadisticas`);
    
    if (data && data.success) {
        console.log('Estadísticas de pedidos cargadas');
                if (charts.pedidosPorTipo) charts.pedidosPorTipo.destroy();
        if (charts.ingresosMensuales) charts.ingresosMensuales.destroy();
        
        const ctx1 = document.getElementById('chartPedidosPorTipo');
        if (ctx1 && data.porTipoCarga) {
            const categoriasLegibles = {
                'PAQUETERÍA EXPRESS': 'Express',
                'CARGA ESTÁNDAR': 'Estándar', 
                'CARGA COMPLETA': 'Completa',
                'CADENA DE FRÍO': 'Cadena Frío',
                'CARGA A GRANEL': 'Granel',
                'CARGA PESADA': 'Pesada'
            };
            
            charts.pedidosPorTipo = new Chart(ctx1, {
                type: 'pie',
                data: {
                    labels: data.porTipoCarga.map(item => 
                        categoriasLegibles[item.tipo_carga] || item.tipo_carga || 'Sin tipo'
                    ),
                    datasets: [{
                        data: data.porTipoCarga.map(item => item.total),
                        backgroundColor: [
                            '#3b82f6', 
                            '#10b981', 
                            '#f59e0b', 
                            '#06b6d4', 
                            '#8b5cf6', 
                            '#ef4444'  
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        title: {
                            display: true,
                            text: 'Pedidos por Tipo de Carga - ' + getEmpresaNombre()
                        }
                    }
                }
            });
        }
        
        const ctx2 = document.getElementById('chartIngresosMensuales');
        if (ctx2 && data.ingresosMensuales) {
            charts.ingresosMensuales = new Chart(ctx2, {
                type: 'line',
                data: {
                    labels: data.ingresosMensuales.map(item => item.mes),
                    datasets: [{
                        label: 'Ingresos (Gs.) - ' + getEmpresaNombre(),
                        data: data.ingresosMensuales.map(item => item.ingresos || 0),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'top' },
                        title: {
                            display: true,
                            text: 'Ingresos Mensuales - ' + getEmpresaNombre()
                        }
                    }
                }
            });
        }
    } else {
        console.error('❌ Error cargando estadísticas de pedidos');
    }
}
async function eliminarPedido(idPedido) {
    if (confirm(`¿Estás seguro de eliminar el pedido #${idPedido}? Esta acción no se puede deshacer.`)) {
        const data = await fetchData(`${API_BASE}/pedidos/${idPedido}`, {
            method: 'DELETE'
        });
        
        if (data && data.success) {
            showNotification('Pedido eliminado exitosamente', 'success');
            cargarPedidos();
        } else {
            showNotification('Error al eliminar pedido', 'error');
        }
    }
}
function getNombreMes(numeroMes) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[numeroMes - 1] || `Mes ${numeroMes}`;
}
async function cargarReportes() {
    console.log('📈 Cargando reportes - GRÁFICO DE BARRAS AZULES...');
    
    const pedidosData = await fetchData(`${API_BASE}/pedidos`);
    
    if (!pedidosData || !pedidosData.success) {
        console.error('❌ No se pudieron cargar los pedidos');
        showNotification('Error al cargar datos de pedidos', 'error');
        
        const ctx1 = document.getElementById('chartViajesPorMes');
        if (ctx1 && charts.viajesPorMes) charts.viajesPorMes.destroy();
        if (ctx1) {
            charts.viajesPorMes = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: ['Sin datos'],
                    datasets: [{ label: 'Viajes', data: [0], backgroundColor: '#3b82f6' }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: { display: true, text: '⚠️ No hay datos de viajes disponibles' }
                    }
                }
            });
        }
        return;
    }
    
    const pedidos = pedidosData.pedidos || [];
    console.log(`📦 Total de pedidos/viajes: ${pedidos.length}`);
    
    if (pedidos.length === 0) {
        console.log('No hay pedidos para mostrar');
        const ctx1 = document.getElementById('chartViajesPorMes');
        if (ctx1 && charts.viajesPorMes) charts.viajesPorMes.destroy();
        if (ctx1) {
            charts.viajesPorMes = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: ['Sin viajes'],
                    datasets: [{ label: 'Viajes', data: [0], backgroundColor: '#3b82f6' }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: { display: true, text: '📭 No hay viajes registrados aún' }
                    }
                }
            });
        }
        return;
    }
    const ctx1 = document.getElementById('chartViajesPorMes');
    if (ctx1) {
        if (charts.viajesPorMes) charts.viajesPorMes.destroy();
        
        const viajesPorMes = new Map();
        
        pedidos.forEach(pedido => {
            let fecha;
            if (pedido.fecha_creacion) {
                fecha = new Date(pedido.fecha_creacion);
            } else if (pedido.fecha) {
                fecha = new Date(pedido.fecha);
            } else {
                return;
            }
            
            if (isNaN(fecha.getTime())) return;
            
            const año = fecha.getFullYear();
            const mes = fecha.getMonth() + 1;
            const mesKey = `${año}-${mes.toString().padStart(2, '0')}`;
            const mesNombre = getNombreMes(mes);
            const mesLabel = `${mesNombre} ${año}`;
            
            const existente = viajesPorMes.get(mesKey);
            viajesPorMes.set(mesKey, {
                mesKey: mesKey,
                label: mesLabel,
                año: año,
                mes: mes,
                cantidad: (existente?.cantidad || 0) + 1
            });
        });
                const datosOrdenados = Array.from(viajesPorMes.values())
            .sort((a, b) => {
                if (a.año !== b.año) return a.año - b.año;
                return a.mes - b.mes;
            });
        
        console.log(`📅 Datos agrupados por mes: ${datosOrdenados.length} meses con actividad`);
        
        const labels = datosOrdenados.map(item => item.label);
        const valores = datosOrdenados.map(item => item.cantidad);
        
        charts.viajesPorMes = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Viajes por Mes',
                    data: valores,
                    backgroundColor: '#3b82f6',  
                    borderRadius: 2,
                    borderSkipped: false,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const cantidad = context.parsed.y;
                                return `📦 ${cantidad} viaje${cantidad !== 1 ? 's' : ''}`;
                            },
                            title: function(tooltipItems) {
                                return `📅 ${tooltipItems[0].label}`;
                            }
                        },
                        backgroundColor: '#1f2937',
                        titleColor: '#fff',
                        bodyColor: '#e5e7eb',
                        padding: 10,
                        borderColor: '#3b82f6',
                        borderWidth: 1
                    },
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: `📊 Analisis de la Empresa`,
                        font: { size: 14, weight: 'bold', family: 'Inter' },
                        padding: { bottom: 20 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { 
                            display: false, 
                            text: 'Número de Viajes',
                            font: { weight: '500', size: 11 }
                        },
                        ticks: { 
                            stepSize: 1, 
                            precision: 0,
                            callback: function(value) {
                                return value + ' viaje' + (value !== 1 ? 's' : '');
                            }
                        },
                        grid: { color: '#e5e7eb' }
                    },
                    x: {
                        title: { 
                            display: false, 
                            text: 'Mes',
                            font: { weight: '500', size: 11 }
                        },
                        ticks: { 
                            maxRotation: 45, 
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 12,
                            font: { size: 11, weight: '500' }
                        },
                        grid: { display: false }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
                const totalViajes = valores.reduce((a, b) => a + b, 0);
        const mesMaximo = datosOrdenados.reduce((max, item, idx) => 
            item.cantidad > (datosOrdenados[max]?.cantidad || 0) ? idx : max, 0);
        
        console.log('📊 RESUMEN DE VIAJES POR MES:');
        console.log(`   ✅ Total viajes: ${totalViajes}`);
        console.log(`   📅 Meses con actividad: ${datosOrdenados.length}`);
        console.log(`   🏆 Mes con más viajes: ${datosOrdenados[mesMaximo]?.label} (${datosOrdenados[mesMaximo]?.cantidad} viajes)`);
        
        showNotification(`📊 ${totalViajes} viajes en ${datosOrdenados.length} meses`, 'success');
    }

    const reportesData = await fetchData(`${API_BASE}/reportes`);
    const ctx2 = document.getElementById('chartTransportistasActivos');
    
    if (ctx2) {
        if (charts.transportistasActivos) charts.transportistasActivos.destroy();
        
        if (reportesData?.success && reportesData.transportistasActivos?.length > 0) {
            const transportistasOrdenados = [...reportesData.transportistasActivos]
                .sort((a, b) => b.envios_completados - a.envios_completados)
                .slice(0, 5);
            
            charts.transportistasActivos = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: transportistasOrdenados.map(item => item.nombre),
                    datasets: [{
                        data: transportistasOrdenados.map(item => item.envios_completados),
                        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],  
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        title: {
                            display: false,
                            text: `🏆 Transportistas De - ${getEmpresaNombre()}`
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.raw / total) * 100).toFixed(1);
                                    return `${context.label}: ${context.raw} viajes (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            charts.transportistasActivos = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['Sin datos'],
                    datasets: [{ data: [1], backgroundColor: ['#e5e7eb'] }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: { display: true, text: 'No hay datos de transportistas' },
                        legend: { display: false }
                    }
                }
            });
        }
    }
}
function logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminAuthenticated');
        localStorage.removeItem('adminUser');
        localStorage.removeItem('empresa_id');
        localStorage.removeItem('empresa_seleccionada');
        
        showNotification('👋 Sesión cerrada exitosamente', 'success');
        
        setTimeout(() => {
            window.location.href = 'login-admin.html';
        }, 1000);
    }
}
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM cargado, inicializando panel...');
    
    const adminToken = localStorage.getItem('adminToken');
    const isAuthenticated = localStorage.getItem('adminAuthenticated');
    
    if (!adminToken || !isAuthenticated) {
        console.log('No autenticado, redirigiendo...');
        alert('Debes iniciar sesión para acceder al panel de administración');
        window.location.href = 'login-admin.html';
        return;
    }
    
    console.log('Usuario autenticado, empresa:', getEmpresaNombre());
    
    const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .tipo-carga-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 500;
        display: inline-block;
    }

    .tipo-carga-badge.paquetería-express,
    .tipo-carga-badge.paqueteria-express { 
        background: #dbeafe; 
        color: #1e40af; 
    }
    
    .tipo-carga-badge.carga-estándar,
    .tipo-carga-badge.carga-estandar { 
        background: #dcfce7; 
        color: #166534; 
    }
    
    .tipo-carga-badge.carga-completa { 
        background: #fef3c7; 
        color: #92400e; 
    }
    
    .tipo-carga-badge.cadena-de-frío,
    .tipo-carga-badge.cadena-de-frio { 
        background: #cffafe; 
        color: #0e7490; 
    }
    
    .tipo-carga-badge.carga-a-granel { 
        background: #ede9fe; 
        color: #5b21b6; 
    }
    
    .tipo-carga-badge.carga-pesada { 
        background: #fee2e2; 
        color: #991b1b; 
    }
    
    .tipo-carga-badge.default {
        background: #f3f4f6;
        color: #6b7280;
    }
`;
document.head.appendChild(style);
        const buscarInput = document.getElementById('buscarUsuario');
    if (buscarInput) {
        buscarInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                cargarUsuarios();
            }
        });
    }
        const filtroRol = document.getElementById('filtroRol');
    if (filtroRol) {
        filtroRol.addEventListener('change', function() {
            cargarUsuarios();
        });
    }
    
    inicializarInfoEmpresa();
    actualizarHeaderUsuario();
    cargarDashboard();
    
    setInterval(() => {
        if (currentTab === 'dashboard') {
            cargarDashboard();
        }
    }, 30000);
    
    console.log('🎉 Panel de administración completamente inicializado');
    
    setTimeout(() => {
        const empresaNombre = getEmpresaNombre();
        showNotification(`🏢 Bienvenido al panel de ${empresaNombre}`, 'success');
    }, 1000);
});
