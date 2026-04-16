function togglePassword() {
    const passwordInput = document.getElementById('contraseña');
    const icon = document.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.className = 'fas fa-eye';
    } else {
        passwordInput.type = 'password';
        icon.className = 'fas fa-eye-slash';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const messageDiv = document.getElementById('message');
    const submitBtn = document.getElementById('submitBtn');
    const empresaInfo = document.getElementById('empresaInfo');
    const empresaNombre = document.getElementById('empresaNombre');
    const empresaGuardada = localStorage.getItem('empresa_seleccionada');
    if (empresaGuardada) {
        const empresa = JSON.parse(empresaGuardada);
        empresaInfo.style.display = 'block';
        empresaNombre.textContent = empresa.nombre_empresa;
    }
    form.addEventListener('submit', handleLogin);

    async function handleLogin(e) {
        e.preventDefault();
        
        const correo = document.getElementById('correo').value;
        const contraseña = document.getElementById('contraseña').value;
        if (!correo || !contraseña) {
            mostrarMensaje('Correo y contraseña son obligatorios', 'error');
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(correo)) {
            mostrarMensaje('Ingresa un correo electrónico válido', 'error');
            return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Iniciando sesión...';

        try {
            const response = await fetch('http://localhost:3000/api/auth/login-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ correo, contraseña })
            });

            const data = await response.json();
            
            if (data.success) {
                mostrarMensaje('' + data.message + ' Redirigiendo...', 'success');
                localStorage.setItem('adminToken', data.token);
                localStorage.setItem('adminAuthenticated', 'true');
                localStorage.setItem('adminUser', JSON.stringify(data.user));
                localStorage.setItem('empresa_id', data.user.empresa_id);
                
                console.log('Login exitoso - Usuario:', data.user.correo);
                console.log('Empresa ID:', data.user.empresa_id);
                console.log('Token guardado:', data.token.substring(0, 20) + '...');
                setTimeout(() => {
                    window.location.href = 'administrador.html';
                }, 1500);
                
            } else {
                mostrarMensaje(data.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Iniciar Sesión';
            }
        } catch (error) {
            console.error('Error en login:', error);
            mostrarMensaje('Error de conexión con el servidor: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Iniciar Sesión';
        }
    }

    function mostrarMensaje(mensaje, tipo) {
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