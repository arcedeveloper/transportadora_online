// ============================================
// CONFIGURACIÓN PARA RAILWAY
// ============================================
const API_URL = 'https://transportadoraonline-production.up.railway.app/api/auth/login-empresa';

console.log('🔧 API Configurada:', API_URL);

const loginForm = document.getElementById('loginForm');
const messageBox = document.getElementById('messageBox');

// Función para mostrar mensajes
function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = '';
    messageBox.classList.add(type);
    messageBox.style.display = 'block';
    
    // Ocultar después de 5 segundos si es éxito o error
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            messageBox.style.display = 'none';
        }, 5000);
    }
}

// Evento de submit del formulario
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const correo = document.getElementById('correo').value.trim();
    const contraseña = document.getElementById('contraseña').value;

    console.log('📤 Intentando login con:', { correo, contraseña: '***' + contraseña.slice(-2) });

    if (!correo || !contraseña) {
        showMessage('❌ Por favor, completa todos los campos.', 'error');
        return;
    }

    showMessage('🔄 Iniciando sesión...', 'info');

    try {
        console.log('🔄 Enviando petición a:', API_URL);
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ correo, contraseña })
        });

        console.log('📥 Respuesta HTTP:', response.status, response.statusText);
        
        if (response.status === 404) {
            console.log('❌ Ruta no encontrada (404)');
            showMessage('⚠️ Error: Ruta no encontrada. Verifica la configuración del servidor.', 'error');
            return;
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos del servidor:', data);

        if (!response.ok || !data.success) {
            console.log('❌ Error en la respuesta:', data.message);
            showMessage(data.message || '❌ Error al iniciar sesión.', 'error');
            return;
        }

        const empresa = data.empresa;
        if (!empresa) {
            console.log('❌ No se recibió objeto empresa');
            showMessage('⚠️ El servidor no envió los datos de la empresa.', 'error');
            return;
        }

        console.log('✅ Login exitoso, empresa:', empresa.nombre_empresa);
        
        // Guardar token si existe
        if (data.token) {
            localStorage.setItem('adminToken', data.token);
            console.log('🔐 Token guardado en localStorage');
        }
        
        // Guardar datos de la empresa
        const empresa_id = empresa.empresa_id || empresa.id;
        localStorage.setItem('empresa', JSON.stringify(empresa));
        localStorage.setItem('empresa_id', empresa_id);
        localStorage.setItem('nombre_empresa', empresa.nombre_empresa || empresa.nombre || '');
        localStorage.setItem('correo_empresa', empresa.correo_electronico || empresa.correo || '');
        localStorage.setItem('telefono_empresa', empresa.telefono || '');
        localStorage.setItem('ciudad_empresa', empresa.ciudad || empresa.ubicacion || '');
        localStorage.setItem('nombre_titular', empresa.nombre_titular || '');
        localStorage.setItem('ruc_empresa', empresa.ruc || '');

        console.log('💾 Datos guardados en localStorage:', {
            empresa_id: empresa_id,
            nombre_empresa: empresa.nombre_empresa,
            token: data.token ? 'GUARDADO' : 'NO HAY TOKEN'
        });
        
        showMessage('✅ ¡Login exitoso! Redirigiendo...', 'success');
        
        setTimeout(() => {
            console.log('🚀 Redirigiendo a empresa.html');
            window.location.href = "empresa.html";
        }, 1500);

    } catch (error) {
        console.error('❌ Error de conexión:', error);
        console.error('🔍 Detalles del error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        showMessage('❌ Error de conexión con el servidor. Verifica que el servidor esté corriendo en Railway.', 'error');
    }
});
