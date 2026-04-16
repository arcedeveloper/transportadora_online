const menuToggle = document.getElementById('menuToggle');
const mobileNav = document.querySelector('nav.mobile');

menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', !expanded);
    mobileNav.classList.toggle('active');
});

menuToggle.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        menuToggle.click();
    }
});

const darkModeToggleDesktop = document.getElementById('darkModeToggle');
const darkModeToggleMobile = document.getElementById('darkModeToggleMobile');

function updateDarkModeUI(isDark) {
    document.body.classList.toggle('dark', isDark);
    darkModeToggleDesktop.textContent = isDark ? 'Modo Claro' : 'Modo Oscuro';
    darkModeToggleMobile.textContent = isDark ? 'Modo Claro' : 'Modo Oscuro';
}

function loadDarkMode() {
    const saved = localStorage.getItem('darkMode');
    const isDark = saved === null ? false : saved === 'true';
    updateDarkModeUI(isDark);
}

function toggleDarkMode() {
    const isDark = !document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    updateDarkModeUI(isDark);
}

darkModeToggleDesktop.addEventListener('click', toggleDarkMode);
darkModeToggleMobile.addEventListener('click', () => {
    toggleDarkMode();
    if (mobileNav.classList.contains('active')) {
        mobileNav.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', false);
    }
});
loadDarkMode();

const passwordToggle = document.getElementById('passwordToggle');
const passwordInput = document.getElementById('contraseña');

if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        passwordToggle.textContent = type === 'password' ? 'visibility_off' : 'visibility';
    });
}

const form = document.getElementById('registroForm');
const errorElements = document.querySelectorAll('.error-msg');
const feedback = document.getElementById('formFeedback');

function clearErrors() {
    errorElements.forEach(el => el.textContent = '');
}
document.getElementById('ubicacion').addEventListener('click', function() {
    abrirMapa();
});
document.getElementById('ubicacion').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirMapa();
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    let valid = true;
    feedback.textContent = '';

    const nombreEmpresa = form.nombre_empresa.value.trim();
    const nombreTitular = form.nombre_titular.value.trim();
    const ruc = form.ruc.value.trim();
    const ubicacion = form.ubicacion.value.trim();
    const correo = form.correo_electronico.value.trim();
    const contrasena = form.contraseña.value.trim();
    const telefono = form.telefono.value.trim();
    const latitud = document.getElementById('latitud').value;
    const longitud = document.getElementById('longitud').value;
    if (!nombreEmpresa) {
        document.getElementById('errorNombreEmpresa').textContent = 'El nombre de la empresa es obligatorio';
        valid = false;
    }

    if (!nombreTitular) {
        document.getElementById('errorNombreTitular').textContent = 'El nombre del titular es obligatorio';
        valid = false;
    }

    if (!ruc) {
        document.getElementById('errorCedulaRuc').textContent = 'El RUC es obligatorio';
        valid = false;
    }

    if (!ubicacion) {
        document.getElementById('errorUbicacion').textContent = 'La ubicación es obligatoria';
        valid = false;
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(correo)) {
        document.getElementById('errorCorreo').textContent = 'Ingrese un correo válido';
        valid = false;
    }

    if (contrasena.length < 6) {
        document.getElementById('errorContraseña').textContent = 'La contraseña debe tener al menos 6 caracteres';
        valid = false;
    }

    const telefonoRegex = /^\+?\d{7,15}$/;
    if (!telefonoRegex.test(telefono)) {
        document.getElementById('errorTelefono').textContent = 'Ingrese un teléfono válido';
        valid = false;
    }
    
    if (valid) {
        try {
            feedback.style.color = '#00c6ff';
            feedback.textContent = 'Procesando registro...';
            
            const response = await fetch('http://localhost:3000/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    nombre_empresa: nombreEmpresa,
                    nombre_titular: nombreTitular,
                    ruc: ruc,
                    ciudad: ubicacion,
                    correo_electronico: correo,
                    contraseña: contrasena,
                    telefono: telefono,
                    latitud: latitud,
                    longitud: longitud
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                feedback.style.color = 'limegreen';
                feedback.textContent = data.message || 'Empresa registrada con éxito.';
                form.reset();
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                
            } else {
                feedback.style.color = 'crimson';
                feedback.textContent = data.message || 'Error al registrar la empresa.';
            }
        } catch (error) {
            console.error('Error:', error);
            feedback.style.color = 'crimson';
            feedback.textContent = 'Ocurrió un error de conexión con el servidor.';
        }
    } else {
        feedback.style.color = 'crimson';
        feedback.textContent = 'Por favor, corrige los errores y vuelve a intentar.';
    }
});
const testimonialItems = document.querySelectorAll('.testimonial-item');
const testimonialBtns = document.querySelectorAll('.testimonial-btn');
let currentTestimonial = 0;

function showTestimonial(index) {
    testimonialItems.forEach(item => item.classList.remove('active'));
    testimonialBtns.forEach(btn => btn.classList.remove('active'));
    if (testimonialItems[index]) {
        testimonialItems[index].classList.add('active');
    }
    if (testimonialBtns[index]) {
        testimonialBtns[index].classList.add('active');
    }
}

testimonialBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
        showTestimonial(idx);
        currentTestimonial = idx;
    });
});

document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
        const item = btn.parentElement;
        const isActive = item.classList.toggle('active');
        btn.setAttribute('aria-expanded', isActive);
        const answer = btn.nextElementSibling;
        if (isActive) {
            answer.removeAttribute('hidden');
        } else {
            answer.setAttribute('hidden', '');
        }
    });
});
let mapa;
let marcador;
let coordenadasExactas = null;
let direccionSeleccionada = '';
function abrirMapa() {
    document.getElementById('mapModal').style.display = 'flex';
    document.getElementById('direccionEncontrada').style.display = 'none';
    setTimeout(() => {
        if (!mapa) {
            mapa = L.map('miniMap').setView([-25.339260, -57.508790], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(mapa);
            
            mapa.on('click', function(e) {
                colocarMarcador(e.latlng);
                obtenerDireccionDesdeCoordenadas(e.latlng);
            });
        }
    }, 100);
}
function obtenerDireccionDesdeCoordenadas(latlng) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
            if (data && data.address) {
                const address = data.address;
                let direccionParts = [];
                if (address.road) direccionParts.push(address.road);
                if (address.suburb) direccionParts.push(address.suburb);
                if (address.city || address.town || address.village) {
                    direccionParts.push(address.city || address.town || address.village);
                }
                
                direccionSeleccionada = direccionParts.join(', ');
                document.getElementById('textoDireccion').textContent = direccionSeleccionada || 'Ubicación seleccionada';
                document.getElementById('direccionEncontrada').style.display = 'block';
                
            } else {
                direccionSeleccionada = 'Ubicación seleccionada en el mapa';
                document.getElementById('textoDireccion').textContent = direccionSeleccionada;
                document.getElementById('direccionEncontrada').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error obteniendo dirección:', error);
            direccionSeleccionada = 'Ubicación seleccionada en el mapa';
            document.getElementById('textoDireccion').textContent = direccionSeleccionada;
            document.getElementById('direccionEncontrada').style.display = 'block';
        });
}
function confirmarUbicacion() {
    if (!coordenadasExactas) {
        alert('Por favor, selecciona una ubicación en el mapa');
        return;
    }
    document.getElementById('ubicacion').value = direccionSeleccionada;
    
    cerrarMapa();
}
function buscarEnMapa() {
    const direccion = document.getElementById('buscarDireccion').value.trim();
    if (!direccion) return;
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion + ', Paraguay')}&limit=1`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const latlng = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
                colocarMarcador(latlng);
                obtenerDireccionDesdeCoordenadas(latlng);
                mapa.setView(latlng, 16);
            } else {
                alert('No se encontró la dirección. Intenta con términos más específicos.');
            }
        })
        .catch(error => {
            console.error('Error buscando dirección:', error);
            alert('Error al buscar la dirección');
        });
}
function colocarMarcador(latlng) {
    if (marcador) {
        mapa.removeLayer(marcador);
    }
    marcador = L.marker(latlng).addTo(mapa);
    coordenadasExactas = latlng;
    document.getElementById('latitud').value = latlng.lat.toFixed(6);
    document.getElementById('longitud').value = latlng.lng.toFixed(6);
}
function cerrarMapa() {
    document.getElementById('mapModal').style.display = 'none';
    coordenadasExactas = null;
    document.getElementById('direccionEncontrada').style.display = 'none';
}
document.getElementById('buscarDireccion').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        buscarEnMapa();
    }
});
setInterval(() => {
    currentTestimonial = (currentTestimonial + 1) % testimonialItems.length;
    showTestimonial(currentTestimonial);
}, 5000);
