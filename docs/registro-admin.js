console.log('Script registro-admin.js CARGADO');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM completamente cargado');
    
    const form = document.getElementById('registerForm');
    const empresaSelect = document.getElementById('empresa_id');
    const messageDiv = document.getElementById('message');
    const submitBtn = document.getElementById('submitBtn');

    console.log('Formulario encontrado:', form);
    console.log('Select empresa encontrado:', empresaSelect);
    console.log('Botón submit encontrado:', submitBtn);
    cargarEmpresas();
    document.getElementById('contraseña').addEventListener('input', validarContraseñas);
    document.getElementById('confirmarContraseña').addEventListener('input', validarContraseñas);
    form.addEventListener('submit', function(e) {
        console.log('EVENTO SUBMIT DISPARADO');
        handleRegistro(e);
    });
    submitBtn.addEventListener('click', function(e) {
        console.log('CLICK EN BOTÓN');
    });

    async function cargarEmpresas() {
        try {
            console.log('Iniciando carga de empresas...');
            mostrarMensaje('Cargando empresas disponibles...', 'loading');
            empresaSelect.innerHTML = '<option value="">Cargando empresas...</option>';
            empresaSelect.disabled = true;

            const response = await fetch('http://localhost:3000/api/auth/empresas-activas');
            console.log('📡 Respuesta de empresas-activas:', response.status);
            
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Datos de empresas recibidos:', data);

            if (data.success && data.empresas && data.empresas.length > 0) {
                console.log(`✅ ${data.empresas.length} empresas cargadas`);
                empresaSelect.innerHTML = '<option value="">Seleccione La Entidad </option>';
                
                data.empresas.forEach(empresa => {
                    const option = document.createElement('option');
                    option.value = empresa.empresa_id;
                    option.textContent = `${empresa.nombre_empresa} (${empresa.ruc || 'Sin RUC'})`;
                    empresaSelect.appendChild(option);
                });
                
                empresaSelect.disabled = false;
                messageDiv.innerHTML = '';
            } else {
                console.log('❌ No hay empresas disponibles');
                empresaSelect.innerHTML = '<option value="">No hay empresas disponibles</option>';
                mostrarMensaje('❌ No hay empresas activas disponibles para registro', 'error');
            }
        } catch (error) {
            console.error('❌ Error cargando empresas:', error);
            empresaSelect.innerHTML = '<option value="">Error al cargar empresas</option>';
            mostrarMensaje(`❌ Error al cargar empresas: ${error.message}`, 'error');
        }
    }

function validarContraseñas() {
    const contraseña = document.getElementById('contraseña').value;
    const confirmar = document.getElementById('confirmarContraseña').value;
    
    console.log('🔐 Validando contraseñas...');
    
    if (contraseña && confirmar && contraseña !== confirmar) {
        return false;
    } else {
        return true;
    }
}

    async function handleRegistro(e) {
        console.log('🎯 EJECUTANDO handleRegistro');
        e.preventDefault();
        
        const nombre = document.getElementById('nombre').value;
        const empresaId = empresaSelect.value;
        const correo = document.getElementById('correo').value;
        const telefono = document.getElementById('telefono').value;
        const contraseña = document.getElementById('contraseña').value;
        const confirmarContraseña = document.getElementById('confirmarContraseña').value;

        console.log('📝 Datos del formulario:', {
            nombre, empresaId, correo, telefono, 
            contraseña: contraseña ? '***' : 'vacía',
            confirmarContraseña: confirmarContraseña ? '***' : 'vacía'
        });
        if (!nombre.trim()) {
            console.log('Validación fallida: nombre vacío');
            mostrarMensaje('El nombre es obligatorio', 'error');
            return;
        }

        if (!empresaId) {
            console.log('Validación fallida: empresa no seleccionada');
            mostrarMensaje('Debes seleccionar una empresa', 'error');
            return;
        }

        if (!validarContraseñas()) {
            console.log('Validación fallida: contraseñas no coinciden');
            mostrarMensaje('Las contraseñas no coinciden', 'error');
            return;
        }

        if (contraseña.length < 6) {
            console.log('Validación fallida: contraseña muy corta');
            mostrarMensaje('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(correo)) {
            console.log('Validación fallida: email inválido');
            mostrarMensaje('Ingresa un correo electrónico válido', 'error');
            return;
        }

        console.log('Todas las validaciones pasaron, enviando registro...');
        submitBtn.disabled = true;
        submitBtn.textContent = '🔄 Registrando...';

        try {
            console.log('📡 Enviando petición a /registro-admin...');
            const response = await fetch('http://localhost:3000/api/auth/registro-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    nombre,
                    correo, 
                    contraseña,
                    telefono: telefono || '',
                    empresa_id: parseInt(empresaId)
                })
            });

            console.log('📡 Respuesta recibida, status:', response.status);
            const data = await response.json();
            console.log('📊 Datos de respuesta:', data);
            
            if (data.success) {
                console.log('Registro exitoso');
                mostrarMensaje('' + data.message + ' Redirigiendo...', 'success');
                const empresaNombre = empresaSelect.options[empresaSelect.selectedIndex].text;
                localStorage.setItem('empresa_seleccionada', JSON.stringify({
                    id_empresa: empresaId,
                    nombre_empresa: empresaNombre.split(' (')[0]
                }));
                if (data.data && data.data.token) {
                    localStorage.setItem('admin_token', data.data.token);
                    localStorage.setItem('user_data', JSON.stringify(data.data));
                }
                
                setTimeout(() => {
                    window.location.href = 'login-admin.html';
                }, 3000);
            } else {
                console.log('Registro fallido:', data.message);
                mostrarMensaje(data.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Registrarse como Administrador';
            }
        } catch (error) {
            console.error('Error en registro:', error);
            mostrarMensaje(`Error de conexión: ${error.message}`, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Registrarse como Administrador';
        }
    }

    function mostrarMensaje(mensaje, tipo) {
        console.log('💬 Mostrando mensaje:', { mensaje, tipo });
        const messageDiv = document.getElementById('message');
        messageDiv.innerHTML = `<div class="${tipo}">${mensaje}</div>`;
        
        if (tipo === 'success') {
            setTimeout(() => {
                if (messageDiv.innerHTML.includes(mensaje)) {
                    messageDiv.innerHTML = '';
                }
            }, 5000);
        }
    }
});