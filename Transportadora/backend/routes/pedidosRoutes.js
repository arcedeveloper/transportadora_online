const express = require('express');
const router = express.Router();
const pool = require('../models/database');
const bcrypt = require('bcrypt');
const { authMiddleware } = require('../middleware/auth');

const DEFAULT_PASSWORD = 'default_password';
const TARIFA_KM = 3000;
const ciudadesRegionOriental = [
    "ASUNCION","CIUDAD DEL ESTE","ENCARNACION","CORONEL OVIEDO",
    "CONCEPCION","SAN LORENZO","LUQUE","CAPIATA","LAMBARE",
    "FERNANDO DE LA MORA","LIMPIO","NEMBY","MARIANO ROQUE ALONSO",
    "VILLA ELISA","SAN ANTONIO","HERNANDARIAS","PRESIDENTE FRANCO",
    "PEDRO JUAN CABALLERO","VILLARRICA","CAACUPE","PARAGUARI",
    "CAAZAPA","SAN JUAN BAUTISTA","SANTA ROSA","AYOLAS", "CURUGUATY"
];
const coordenadasCiudad = {
    "ASUNCION": { lat: -25.2637, lng: -57.5759 },
    "CIUDAD DEL ESTE": { lat: -25.5167, lng: -54.6167 },
    "ENCARNACION": { lat: -27.3333, lng: -55.8667 },
    "CORONEL OVIEDO": { lat: -25.4167, lng: -56.4500 },
    "CONCEPCION": { lat: -23.4064, lng: -57.4344 },
    "SAN LORENZO": { lat: -25.3434, lng: -57.5078 },
    "LUQUE": { lat: -25.2667, lng: -57.4833 },
    "CAPIATA": { lat: -25.3550, lng: -57.4450 },
    "LAMBARE": { lat: -25.3464, lng: -57.6069 },
    "FERNANDO DE LA MORA": { lat: -25.3386, lng: -57.5217 },
    "LIMPIO": { lat: -25.1667, lng: -57.4833 },
    "NEMBY": { lat: -25.3944, lng: -57.5353 },
    "MARIANO ROQUE ALONSO": { lat: -25.1667, lng: -57.5333 },
    "VILLA ELISA": { lat: -25.3667, lng: -57.6167 },
    "SAN ANTONIO": { lat: -25.3833, lng: -57.6333 },
    "HERNANDARIAS": { lat: -25.3667, lng: -54.7667 },
    "PRESIDENTE FRANCO": { lat: -25.5333, lng: -54.6167 },
    "PEDRO JUAN CABALLERO": { lat: -22.5472, lng: -55.7333 },
    "VILLARRICA": { lat: -25.7500, lng: -56.4333 },
    "CAACUPE": { lat: -25.3833, lng: -57.1500 },
    "PARAGUARI": { lat: -25.6167, lng: -57.1500 },
    "CAAZAPA": { lat: -26.2000, lng: -56.3667 },
    "SAN JUAN BAUTISTA": { lat: -26.6667, lng: -57.1500 },
    "SANTA ROSA": { lat: -26.8667, lng: -56.8500 },
    "AYOLAS": { lat: -27.4000, lng: -56.9000 },
    "CURUGUATY": { lat: -24.4699, lng: -55.6936 } 
};
function normalizarTexto(texto) {
    return texto.toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function esCiudadOriental(ciudad) {
    return ciudadesRegionOriental.includes(normalizarTexto(ciudad));
}

function estaEnRegionOriental(lat, lng) {
    return lat >= -27.5 && lat <= -22.0 && lng >= -58.0 && lng <= -54.0;
}

function factorTipoCarga(tipoCarga) {
    if (!tipoCarga) return 1;
    
    const tipo = tipoCarga.toUpperCase();
    
    if (tipo.includes('EXPRESS')) return 1.5;
    if (tipo.includes('ESTÁNDAR') || tipo.includes('ESTANDAR')) return 1.2;
    if (tipo.includes('COMPLETA')) return 1.8;
    if (tipo.includes('FRÍO') || tipo.includes('FRIO') || tipo.includes('CADENA')) return 1.8;
    if (tipo.includes('GRANEL')) return 2.0;
    if (tipo.includes('PESADA')) return 2.5;
    
    return 1;
}

function calcularDistanciaReal(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function distanciaKm(origen, destino) {
    const R = 6371;
    const o = coordenadasCiudad[normalizarTexto(origen)];
    const d = coordenadasCiudad[normalizarTexto(destino)];
    if (!o || !d) return 100;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(d.lat - o.lat);
    const dLon = toRad(d.lng - o.lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(o.lat)) * Math.cos(toRad(d.lat)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function extraerCiudadDesdeDireccionOSM(direccion) {
    if (!direccion || direccion.includes('no disponible') || direccion.includes('NO DISPONIBLE')) {
        console.log('⚠️  Dirección no disponible - no se puede extraer ciudad');
        return null;
    }
    
    console.log('🔍 Extrayendo ciudad desde dirección:', direccion);
    
    try {
        const direccionUpper = direccion.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (direccionUpper.includes('NUEVA ASUNCION') || direccionUpper.includes('NUEVA ASUNCIÓN')) {
            if (direccionUpper.includes('SAN LORENZO')) {
                console.log('✅ "Nueva Asunción" detectada en SAN LORENZO');
                return 'SAN LORENZO';
            } else if (direccionUpper.includes('FERNANDO')) {
                console.log('✅ "Nueva Asunción" detectada en FERNANDO DE LA MORA');
                return 'FERNANDO DE LA MORA';
            } else {
                console.log('✅ "Nueva Asunción" detectada, usando FERNANDO DE LA MORA por defecto');
                return 'FERNANDO DE LA MORA';
            }
        }
        
        const ciudadesConSinonimos = {
            'ASUNCION': ['ASUNCION', 'ASUNCIÓN'],
            'CIUDAD DEL ESTE': ['CIUDAD DEL ESTE', 'CDE'],
            'ENCARNACION': ['ENCARNACION', 'ENCARNACIÓN'],
            'CORONEL OVIEDO': ['CORONEL OVIEDO'],
            'CONCEPCION': ['CONCEPCION', 'CONCEPCIÓN'],
            'SAN LORENZO': ['SAN LORENZO'],
            'LUQUE': ['LUQUE'],
            'CAPIATA': ['CAPIATA', 'CAPIATÁ'],
            'LAMBARE': ['LAMBARE', 'LAMBARÉ'],
            'FERNANDO DE LA MORA': ['FERNANDO DE LA MORA'],
            'LIMPIO': ['LIMPIO'],
            'NEMBY': ['NEMBY', 'ÑEMBY'],
            'MARIANO ROQUE ALONSO': ['MARIANO ROQUE ALONSO'],
            'VILLA ELISA': ['VILLA ELISA', 'VILLA ELÍSA'],
            'SAN ANTONIO': ['SAN ANTONIO'],
            'HERNANDARIAS': ['HERNANDARIAS'],
            'PRESIDENTE FRANCO': ['PRESIDENTE FRANCO'],
            'PEDRO JUAN CABALLERO': ['PEDRO JUAN CABALLERO', 'PEDRO JUAN'],
            'VILLARRICA': ['VILLARRICA'],
            'CAACUPE': ['CAACUPE', 'CAACUPÉ'],
            'PARAGUARI': ['PARAGUARI'],
            'CAAZAPA': ['CAAZAPA', 'CAAZAPÁ'],
            'SAN JUAN BAUTISTA': ['SAN JUAN BAUTISTA'],
            'SANTA ROSA': ['SANTA ROSA'],
            'AYOLAS': ['AYOLAS'],
            'CURUGUATY': ['CURUGUATY', 'CURUGUATÍ'] 
        };
        const palabras = direccionUpper.split(/[, ]+/);
        for (let i = palabras.length - 1; i >= 0; i--) {
            const palabra = palabras[i].trim();
            if (palabra && palabra.length > 2) {
                for (const [ciudad, sinonimos] of Object.entries(ciudadesConSinonimos)) {
                    for (const sinonimo of sinonimos) {
                        const sinonimoNormalizado = sinonimo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        if (palabra === sinonimoNormalizado) {
                            console.log(`✅ Ciudad encontrada por palabra exacta: ${ciudad} (palabra: ${palabra})`);
                            return ciudad;
                        }
                    }
                }
            }
        }
        for (const [ciudad, sinonimos] of Object.entries(ciudadesConSinonimos)) {
            for (const sinonimo of sinonimos) {
                const sinonimoNormalizado = sinonimo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                
                const regex = new RegExp('\\b' + sinonimoNormalizado + '\\b', 'i');
                if (regex.test(direccionUpper)) {
                    console.log(`✅ Ciudad encontrada por boundary: ${ciudad} (por: ${sinonimo})`);
                    return ciudad;
                }
                
            }
        }
        
        const departamentos = {
            'CENTRAL': 'ASUNCION',
            'ALTO PARANA': 'CIUDAD DEL ESTE', 
            'ITAPUA': 'ENCARNACION',
            'CAAGUAZU': 'CORONEL OVIEDO',
            'CONCEPCION': 'CONCEPCION',
            'CAAZAPA': 'CAAZAPA',
            'PARAGUARI': 'PARAGUARI',
            'CORDILLERA': 'CAAZAPA',
            'GUAIRA': 'VILLARRICA',
            'SAN PEDRO': 'SAN PEDRO',
            'AMAMBAY': 'PEDRO JUAN CABALLERO',
            'CANINDEYU': 'CURUGUATY', 
            'MISIONES': 'SAN JUAN BAUTISTA',
            'NEEMBUCU': 'PILAR'
        };
        
        for (const [departamento, ciudad] of Object.entries(departamentos)) {
            if (direccionUpper.includes(departamento)) {
                console.log(`✅ Ciudad inferida por departamento: ${ciudad} (departamento: ${departamento})`);
                return ciudad;
            }
        }

    } catch (error) {
        console.error('❌ Error extrayendo ciudad:', error);
    }
    
    console.log('⚠️  No se pudo extraer ciudad de:', direccion);
    return null;  
}

function formatearDireccionOSM(address) {
    if (!address) return 'Dirección no disponible';
    
    const components = [];
    
    if (address.road) components.push(address.road);
    if (address.house_number) components.push(address.house_number);
    
    if (address.suburb) components.push(address.suburb);
    else if (address.neighbourhood) components.push(address.neighbourhood);
    
    if (address.city) components.push(address.city);
    else if (address.town) components.push(address.town);
    else if (address.village) components.push(address.village);
    
    if (address.state) components.push(address.state);
    
    if (address.country) components.push(address.country);
    
    if (components.length <= 2) {
        return address.display_name || 'Dirección no disponible';
    }
    
    return components.join(', ');
}
router.put('/envios/:envioId/estado', authMiddleware, async (req, res) => {
  const { envioId } = req.params;
  const { estado } = req.body;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await actualizarEstadoEnvio({
      connection,
      req,
      envioId,
      nuevoEstado: estado
    });

    await connection.commit();
    res.json({ success: true, estado });

  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/geocoding/reverse', async (req, res) => {
    const { lat, lng } = req.body;
    
    console.log('📍 Geocoding inverso solicitado (OpenStreetMap):', { lat, lng });

    if (!lat || !lng) {
        return res.status(400).json({ 
            success: false, 
            message: 'Latitud y longitud son requeridas' 
        });
    }

    try {
        const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es`,
    {
        headers: {
            'User-Agent': 'TransportadoraApp/1.0 (contacto@transportadora.com)'
        }
    }
);
        
        const data = await response.json();

        if (!data || data.error) {
            console.error('❌ Error en geocoding OSM:', data?.error);
            return res.status(400).json({
                success: false,
                message: 'No se pudo obtener la dirección para estas coordenadas'
            });
        }

        const direccion = formatearDireccionOSM(data.address);
        
        console.log('✅ Dirección obtenida (OSM):', direccion);

        res.json({
            success: true,
            direccion: direccion,
            datos_completos: data
        });

    } catch (error) {
        console.error('❌ Error en geocoding inverso:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.post('/geocoding/forward', async (req, res) => {
    const { direccion } = req.body;
    
    console.log('📍 Geocoding directo solicitado:', { direccion });

    if (!direccion) {
        return res.status(400).json({ 
            success: false, 
            message: 'La dirección es requerida' 
        });
    }

    try {
        const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}&limit=1&accept-language=es`,
    {
        headers: {
            'User-Agent': 'TransportadoraApp/1.0 (contacto@transportadora.com)'
        }
    }
);
        
        const data = await response.json();

        if (!data || data.length === 0) {
            console.error('❌ No se encontraron resultados para:', direccion);
            return res.status(404).json({
                success: false,
                message: 'No se pudo encontrar la ubicación'
            });
        }

        const resultado = data[0];
        
        console.log('✅ Coordenadas obtenidas:', { 
            lat: resultado.lat, 
            lng: resultado.lon,
            direccion: resultado.display_name 
        });

        res.json({
            success: true,
            lat: parseFloat(resultado.lat),
            lng: parseFloat(resultado.lon),
            direccion: resultado.display_name
        });

    } catch (error) {
        console.error('❌ Error en geocoding directo:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.get('/todos', authMiddleware, async (req, res) => {
    try {
        console.log('📦 Solicitando TODOS los pedidos para panel empresa...');
        console.log('🏢 Empresa del usuario:', req.user.empresa_id);
        
        const sql = `
            SELECT 
                p.id_pedido, 
                p.id_usuario,  
                p.descripcion, 
                p.direccion_origen,
                p.direccion_destino,
                p.fecha_envio, 
                p.tipo_carga, 
                p.costo,
                p.fecha_creacion,
                p.latitud_origen,
                p.longitud_origen,
                p.latitud_destino,
                p.longitud_destino,
                IFNULL(e.estado, 'PENDIENTE') AS estado,
                t.nombre AS transportista,
                t.id_transportista,
                c.cedula
            FROM pedidos p
            LEFT JOIN clientes c ON p.id_cliente = c.id_cliente
            LEFT JOIN envios e ON p.id_pedido = e.id_pedido
            LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista
            WHERE p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC
        `;
        
        const [rows] = await pool.query(sql, [req.user.empresa_id]);
        console.log(`✅ Encontrados ${rows.length} pedidos para empresa ${req.user.empresa_id}`);
        
        res.json(rows);
        
    } catch (error) {
        console.error('❌ Error al obtener todos los pedidos:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
router.post('/registro-rapido', async (req, res) => {
    const { email, ci, nombre } = req.body;
    if (!email || !ci) return res.status(400).json({ message: 'Email y cédula son requeridos' });
    const nombreCliente = nombre || 'Cliente';
    let connection;

    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            `SELECT u.id_usuario, c.id_cliente FROM usuarios u
             JOIN clientes c ON u.id_usuario = c.id_usuario
             WHERE u.correo = ?`,
            [email]
        );

        if (rows.length > 0) {
            return res.status(200).json({
                message: 'Usuario encontrado. Sesión iniciada.',
                userId: rows[0].id_usuario,
                clienteId: rows[0].id_cliente
            });
        }

        const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
        const [userResult] = await connection.execute(
            'INSERT INTO usuarios (correo, contraseña, id_rol) VALUES (?, ?, ?)',
            [email, hashedPassword, 3]
        );

        const newUserId = userResult.insertId;
        const [clienteResult] = await connection.execute(
            'INSERT INTO clientes (cedula, id_usuario) VALUES (?, ?)',
            [ci, newUserId]
        );

        res.status(201).json({
            message: 'Usuario registrado con éxito. Sesión iniciada.',
            userId: newUserId,
            clienteId: clienteResult.insertId
        });

    } catch (error) {
        console.error('Error en /registro-rapido:', error);
        res.status(500).json({ message: 'Error de conexión al servidor.' });
    } finally {
        if (connection) connection.release();
    }
});
router.post('/nuevo-pedido', authMiddleware, async (req, res) => {
    const { 
        id_cliente, id_usuario, 
        direccion_origen, direccion_destino,
        latitud_origen, longitud_origen,
        latitud_destino, longitud_destino,
        fecha_envio, tipo_carga, id_transportista, descripcion,
        costo 
    } = req.body;

    console.log('📦 Creando pedido COMPLETAMENTE CORREGIDO:', {
        id_cliente, id_usuario,
        direccion_origen, direccion_destino,
        latitud_origen, longitud_origen, 
        latitud_destino, longitud_destino,
        costo 
    });
    
    if (!id_cliente || !id_usuario || !fecha_envio || !id_transportista) {
        return res.status(400).json({ 
            success: false,
            message: 'Datos básicos obligatorios faltantes: id_cliente, id_usuario, fecha_envio, id_transportista.' 
        });
    }

    if (!direccion_origen || !direccion_destino) {
        return res.status(400).json({ 
            success: false,
            message: 'Direcciones de origen y destino son requeridas.' 
        });
    }
    
    console.log('📍 Iniciando validación...');
    if (latitud_origen && longitud_origen && latitud_destino && longitud_destino) {
        console.log('📍 Validando por COORDENADAS (tenemos coordenadas)');
        
        const distancia = calcularDistanciaReal(
            latitud_origen, longitud_origen,
            latitud_destino, longitud_destino
        );
        
        console.log(`📏 Distancia entre coordenadas: ${distancia.toFixed(2)} km`);
        
        if (distancia < 0.1) { 
            console.log('❌ Error: Misma ubicación (coordenadas)');
            return res.status(400).json({ 
                success: false,
                message: `El origen y destino están demasiado cerca (${distancia.toFixed(1)} km).` 
            });
        }
        
        console.log('✅ Coordenadas diferentes - validación OK');
        
    } else {
        console.log('📍 Validando por CIUDADES (no hay coordenadas)');
        
        const ciudadOrigen = extraerCiudadDesdeDireccionOSM(direccion_origen);
        const ciudadDestino = extraerCiudadDesdeDireccionOSM(direccion_destino);
        
        console.log('🏙️  Ciudades extraídas:', { ciudadOrigen, ciudadDestino });
        if (!ciudadOrigen || !ciudadDestino) {
            console.log('❌ Error: No se pudieron determinar las ciudades');
            return res.status(400).json({ 
                success: false,
                message: 'No se pudieron identificar las ciudades de origen y destino. Por favor, proporciona direcciones más específicas o habilita la ubicación.' 
            });
        }
        
        if (normalizarTexto(ciudadOrigen) === normalizarTexto(ciudadDestino)) {
            console.log('❌ Error: Misma ciudad (sin coordenadas)');
            return res.status(400).json({ 
                success: false,
                message: 'La ciudad de origen y destino no pueden ser la misma.' 
            });
        }
        
        console.log('✅ Ciudades diferentes - validación OK');
    }

    if (latitud_origen && longitud_origen && latitud_destino && longitud_destino) {
        if (!estaEnRegionOriental(latitud_origen, longitud_origen) || 
            !estaEnRegionOriental(latitud_destino, longitud_destino)) {
            console.log('❌ Coordenadas fuera de Región Oriental:', {
                origen: { lat: latitud_origen, lng: longitud_origen },
                destino: { lat: latitud_destino, lng: longitud_destino }
            });
            return res.status(400).json({ 
                success: false,
                message: 'Las ubicaciones seleccionadas están fuera de la Región Oriental de Paraguay.' 
            });
        }
        console.log('✅ Coordenadas validadas: dentro de Región Oriental');
    } else {
        console.warn('⚠️  No hay coordenadas disponibles, usando validación por ciudad como fallback');
        const ciudadOrigen = extraerCiudadDesdeDireccionOSM(direccion_origen);
        const ciudadDestino = extraerCiudadDesdeDireccionOSM(direccion_destino);
        
        if (!esCiudadOriental(ciudadOrigen) || !esCiudadOriental(ciudadDestino)) {
            console.log('❌ Ciudades fuera de cobertura:', { ciudadOrigen, ciudadDestino });
            return res.status(400).json({ 
                success: false,
                message: 'Solo entregamos en la Región Oriental de Paraguay.' 
            });
        }
    }
    let distancia;
    if (latitud_origen && longitud_origen && latitud_destino && longitud_destino) {
        distancia = calcularDistanciaReal(latitud_origen, longitud_origen, latitud_destino, longitud_destino);
        console.log(`📏 Distancia calculada por COORDENADAS: ${distancia.toFixed(2)} km`);
    } else {
        const ciudadOrigen = extraerCiudadDesdeDireccionOSM(direccion_origen);
        const ciudadDestino = extraerCiudadDesdeDireccionOSM(direccion_destino);
        
        if (ciudadOrigen && ciudadDestino) {
            distancia = distanciaKm(ciudadOrigen, ciudadDestino);
            console.log(`📏 Distancia calculada por CIUDADES: ${distancia.toFixed(2)} km`);
        } else {
            distancia = 100;
            console.log(`⚠️  No se pudo calcular distancia, usando valor por defecto: ${distancia} km`);
        }
    }
    const costoFinal = typeof costo === 'number' ? costo : parseFloat(costo) || 0;
    
    console.log(`💰 Costo recibido del frontend: ${costoFinal} GS (NO se recalcula)`);
    console.log(`📊 Comparación: Distancia=${distancia.toFixed(2)} km, Costo=${costoFinal}`);
    const TARIFA_KM = 3000; 
    const costoBackendComparacion = Math.round(distancia * TARIFA_KM * factorTipoCarga(tipo_carga));
    console.log(`🔍 Para comparar: Backend hubiera calculado ${costoBackendComparacion} GS con tarifa=${TARIFA_KM}`);
    
    try {
        const [transportista] = await pool.query(
            'SELECT * FROM transportistas WHERE id_transportista = ? AND estado = "Libre"',
            [id_transportista]
        );

        if (transportista.length === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'Transportista no disponible.'
            });
        }
        
        const [result] = await pool.query(
            `INSERT INTO pedidos (
                id_cliente, id_usuario, 
                direccion_origen, direccion_destino,
                latitud_origen, longitud_origen,
                latitud_destino, longitud_destino,
                fecha_envio, tipo_carga, costo, descripcion, fecha_creacion,
                empresa_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
                id_cliente, id_usuario,
                direccion_origen, direccion_destino,
                latitud_origen, longitud_origen,
                latitud_destino, longitud_destino,
                fecha_envio, tipo_carga || 'NORMAL', costoFinal, descripcion || null,
                req.user.empresa_id
            ]
        );

        const idPedido = result.insertId;
        await pool.query(
            `INSERT INTO envios (id_pedido, id_transportista, estado, empresa_id) VALUES (?, ?, 'PENDIENTE', ?)`,
            [idPedido, id_transportista, req.user.empresa_id]
        );
        
        console.log(`✅ Pedido creado - Transportista ${id_transportista} sigue DISPONIBLE (no ocupado)`);
        const ciudadOrigenFinal = extraerCiudadDesdeDireccionOSM(direccion_origen);
        const ciudadDestinoFinal = extraerCiudadDesdeDireccionOSM(direccion_destino);

        console.log('✅ Pedido creado exitosamente (COMPLETAMENTE CORREGIDO):', { 
            idPedido, 
            costo: costoFinal, 
            distancia: distancia.toFixed(2),
            ciudadOrigen: ciudadOrigenFinal, 
            ciudadDestino: ciudadDestinoFinal,
            empresa_id: req.user.empresa_id
        });

        res.status(201).json({ 
            success: true, 
            message: 'Pedido creado exitosamente.', 
            pedidoId: idPedido, 
            costo: costoFinal,
            distancia: Math.round(distancia),
            ciudadOrigen: ciudadOrigenFinal,
            ciudadDestino: ciudadDestinoFinal
        });

    } catch (error) {
        console.error('❌ Error al crear pedido:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor al crear pedido: ' + error.message 
        });
    }
});
router.get('/mis-pedidos/:clienteId', authMiddleware, async (req, res) => {
    const { clienteId } = req.params;

    console.log('📦 Obteniendo pedidos para cliente:', clienteId);
    console.log('🏢 Empresa del usuario:', req.user.empresa_id);

    try {
        const sql = `
            SELECT
                p.id_pedido AS id,
                p.id_cliente,
                p.empresa_id,
                p.id_usuario,
                p.direccion_origen,
                p.direccion_destino,
                p.fecha_envio,
                p.tipo_carga,
                p.costo,
                p.descripcion,
                p.fecha_creacion,
                p.latitud_origen,
                p.longitud_origen,
                p.latitud_destino,
                p.longitud_destino,
                IFNULL(e.estado, 'PENDIENTE') AS estado,
                IFNULL(t.nombre, 'Pendiente de asignación') AS transportista_nombre,
                t.id_transportista
            FROM pedidos p
            LEFT JOIN envios e ON p.id_pedido = e.id_pedido
            LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista
            WHERE p.id_cliente = ?
            AND p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC
        `;

        const [rows] = await pool.query(sql, [clienteId, req.user.empresa_id]);

        console.log(`✅ Encontrados ${rows.length} pedidos para cliente ${clienteId}`);
        const pedidosFormateados = rows.map(pedido => ({
            id_pedido: pedido.id,
            id_cliente: pedido.id_cliente,
            empresa_id: pedido.empresa_id,
            id_usuario: pedido.id_usuario,
            direccion_origen: pedido.direccion_origen,
            direccion_destino: pedido.direccion_destino,
            fecha_envio: pedido.fecha_envio ? new Date(pedido.fecha_envio).toISOString().split('T')[0] : null,
            tipo_carga: pedido.tipo_carga,
            costo: parseFloat(pedido.costo) || 0,
            descripcion: pedido.descripcion,
            fecha_creacion: pedido.fecha_creacion,
            estado: pedido.estado,
            transportista_nombre: pedido.transportista_nombre,
            id_transportista: pedido.id_transportista,
            latitud_origen: pedido.latitud_origen ? parseFloat(pedido.latitud_origen) : null,
            longitud_origen: pedido.longitud_origen ? parseFloat(pedido.longitud_origen) : null,
            latitud_destino: pedido.latitud_destino ? parseFloat(pedido.latitud_destino) : null,
            longitud_destino: pedido.longitud_destino ? parseFloat(pedido.longitud_destino) : null
        }));

        res.json(pedidosFormateados);

    } catch (error) {
        console.error('❌ Error al obtener pedidos del cliente:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
async function crearChatAutomatico(connection, idPedido, empresaId) {
    try {
        console.log('💬 Creando chat automático para pedido aceptado:', idPedido);
        const [pedidoData] = await connection.query(`
            SELECT 
                p.id_pedido,
                p.id_cliente,
                p.direccion_origen,
                p.direccion_destino,
                e.id_envio,
                e.id_transportista,
                t.nombre as transportista_nombre,
                t.telefono as transportista_telefono,
                c.cedula as cliente_cedula
            FROM pedidos p
            JOIN envios e ON p.id_pedido = e.id_pedido
            JOIN transportistas t ON e.id_transportista = t.id_transportista
            JOIN clientes c ON p.id_cliente = c.id_cliente
            WHERE p.id_pedido = ? AND p.empresa_id = ?
        `, [idPedido, empresaId]);

        if (pedidoData.length === 0) {
            console.log('❌ Pedido no encontrado para crear chat');
            return null;
        }

        const pedido = pedidoData[0];
        const { id_cliente, id_transportista, transportista_nombre } = pedido;
        const [chatExistente] = await connection.query(`
            SELECT id FROM chats 
            WHERE transportista_id = ? AND cliente_id = ? AND empresa_id = ?
        `, [id_transportista, id_cliente, empresaId]);

        if (chatExistente.length > 0) {
            console.log('✅ Chat ya existe:', chatExistente[0].id);
            return chatExistente[0].id;
        }
        const [result] = await connection.query(`
            INSERT INTO chats (empresa_id, transportista_id, cliente_id, activo) 
            VALUES (?, ?, ?, 1)
        `, [empresaId, id_transportista, id_cliente]);

        const chatId = result.insertId;
        const mensajeBienvenida = `Hola! Soy ${transportista_nombre}, tu transportista asignado para el pedido #${idPedido}. Puedes contactarme aquí para coordinar la entrega.`;

        await connection.query(`
            INSERT INTO mensajes (chat_id, remitente_tipo, mensaje, enviado_en)
            VALUES (?, 'transportista', ?, NOW())
        `, [chatId, mensajeBienvenida]);

        console.log('✅ Chat creado automáticamente al aceptar pedido:', {
            chatId,
            pedidoId: idPedido,
            clienteId: id_cliente,
            transportistaId: id_transportista,
            transportistaNombre: transportista_nombre
        });

        return chatId;

    } catch (error) {
        console.error('❌ Error creando chat automático:', error);
        return null;
    }
}
async function actualizarEstadoEnvio({ connection, req, envioId, nuevoEstado }) {
    try {

        const [envioRows] = await connection.query(`
            SELECT 
                e.id_envio,
                e.id_pedido,
                e.id_transportista,
                e.estado,
                p.id_cliente,
                p.empresa_id,
                p.direccion_origen,
                p.direccion_destino,
                t.nombre as transportista_nombre
            FROM envios e
            JOIN pedidos p ON e.id_pedido = p.id_pedido
            JOIN transportistas t ON e.id_transportista = t.id_transportista
            WHERE e.id_envio = ?
        `, [envioId]);

        if (envioRows.length === 0) {
            throw new Error('Envío no encontrado');
        }

        const envio = envioRows[0];

        await connection.query(
            `UPDATE envios SET estado = ? WHERE id_envio = ?`,
            [nuevoEstado, envioId]
        );
        if (['ACEPTADO', 'EN CAMINO'].includes(nuevoEstado)) {
            await connection.query(
                `UPDATE transportistas SET estado = 'Ocupado' WHERE id_transportista = ?`,
                [envio.id_transportista]
            );
        }

        if (['ENTREGADO', 'RECHAZADO'].includes(nuevoEstado)) {
            await connection.query(
                `UPDATE transportistas SET estado = 'Libre' WHERE id_transportista = ?`,
                [envio.id_transportista]
            );
        }

        if (nuevoEstado === 'ACEPTADO') {
            await crearChatAutomatico(connection, envio.id_pedido, envio.empresa_id);
        }
        const io = req.app.get('io');
        if (io) {
            const estadosParaNotificar = ['ACEPTADO', 'RECHAZADO'];
            
            if (estadosParaNotificar.includes(nuevoEstado)) {
                if (!global.notificacionesManuales) global.notificacionesManuales = new Map();
                const claveNotificacion = `${envioId}_${nuevoEstado}`;
                if (!global.notificacionesManuales.has(claveNotificacion) || 
                    Date.now() - global.notificacionesManuales.get(claveNotificacion) > 30000) {
                    
                    global.notificacionesManuales.set(claveNotificacion, Date.now());
                    const notificacionesManuales = {
                        'ACEPTADO': {
                            titulo: '✅ Pedido Aceptado',
                            mensaje: `¡Tu pedido #${envio.id_pedido} ha sido aceptado! El transportista ${envio.transportista_nombre} lo está preparando para el envío.`,
                            tipo: 'success'
                        },
                        'RECHAZADO': {
                            titulo: '❌ Pedido Rechazado',
                            mensaje: `Lo sentimos, tu pedido #${envio.id_pedido} ha sido rechazado. Contacta al soporte para más información o realiza un nuevo pedido.`,
                            tipo: 'warning'
                        }
                    };

                    if (notificacionesManuales[nuevoEstado]) {
                        const notificacion = notificacionesManuales[nuevoEstado];

                        const notificacionSocket = {
                            id_notificacion: null,
                            notificationId: Date.now(),
                            empresa_id: envio.empresa_id,
                            id_cliente: envio.id_cliente,
                            id_pedido: envio.id_pedido,
                            titulo: notificacion.titulo,
                            mensaje: notificacion.mensaje,
                            tipo: notificacion.tipo,
                            leida: false,
                            fecha_creacion: new Date().toISOString(),
                            timestamp: new Date().toISOString(),
                            estado: nuevoEstado,
                            transportistaNombre: envio.transportista_nombre
                        };
                        io.to(`cliente_${envio.id_cliente}`).emit('nueva_notificacion', notificacionSocket);
                        io.to(`envio_tracking_${envio.id_pedido}`).emit('estado-envio-actualizado', {
                            envioId: envioId,
                            pedidoId: envio.id_pedido,
                            estado: nuevoEstado,
                            timestamp: new Date(),
                            notificacion: notificacionSocket
                        });

                        console.log(`📢 Notificación MANUAL de ${nuevoEstado} enviada a cliente ${envio.id_cliente}`);
                    }
                } else {
                    console.log(`⏭️  Notificación ${nuevoEstado} enviada recientemente - OMITIENDO`);
                }
            }
            const estadosTracking = ['yendo_origen', 'en_origen', 'en_destino', 'completado', 'en_ubicacion'];
            if (estadosTracking.includes(nuevoEstado.toLowerCase())) {
                console.log(`⏭️  Estado de tracking ${nuevoEstado} - El WebSocket manejará la notificación`);
            }
            io.emit('pedido_estado_actualizado', {
                envioId,
                estado: nuevoEstado,
                pedidoId: envio.id_pedido
            });

            if (nuevoEstado === 'ENTREGADO') {
                io.emit('pedido_entregado', {
                    envioId,
                    pedidoId: envio.id_pedido
                });
            }
        }

        return true;

    } catch (error) {
        console.error('❌ Error actualizando estado del envío:', error);
        throw error;
    }
}
router.put('/aceptar-pedido/:envioId', authMiddleware, async (req, res) => {
  const { envioId } = req.params;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await actualizarEstadoEnvio({
      connection,
      req,
      envioId,
      nuevoEstado: 'ACEPTADO'
    });

    await connection.commit();
    res.json({ success: true, message: 'Pedido aceptado' });

  } catch (err) {
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.put('/rechazar-pedido/:envioId', authMiddleware, async (req, res) => {
  const { envioId } = req.params;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await actualizarEstadoEnvio({
      connection,
      req,
      envioId,
      nuevoEstado: 'RECHAZADO'
    });

    await connection.commit();
    res.json({ success: true, message: 'Pedido rechazado' });

  } catch (err) {
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/ubicacion/:pedidoId', authMiddleware, async (req, res) => {
    const { pedidoId } = req.params;
    try {
        const [pedidoCheck] = await pool.query(
            'SELECT empresa_id FROM pedidos WHERE id_pedido = ?',
            [pedidoId]
        );
        
        if (pedidoCheck.length === 0 || pedidoCheck[0].empresa_id !== req.user.empresa_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para ver esta ubicación.' 
            });
        }

        const sql = 'SELECT latitud AS lat, longitud AS lng FROM ubicaciones WHERE id_pedido = ? ORDER BY fecha DESC LIMIT 1';
        const [rows] = await pool.query(sql, [pedidoId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Ubicación no encontrada.' });
        res.json({ success: true, lat: rows[0].lat, lng: rows[0].lng });
    } catch (error) {
        console.error('Error al obtener ubicación:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});
router.post('/asignar-transportista', authMiddleware, async (req, res) => {
  const { id_pedido, id_transportista } = req.body;
  
  console.log('Asignando transportista:', { id_pedido, id_transportista });
  console.log('Empresa del usuario:', req.user.empresa_id);

  if (!id_pedido || !id_transportista) {
    return res.status(400).json({ 
      success: false, 
      message: 'Faltan datos requeridos: id_pedido y id_transportista' 
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const [pedidoExistente] = await connection.query(
      `SELECT p.*, e.id_transportista 
       FROM pedidos p 
       LEFT JOIN envios e ON p.id_pedido = e.id_pedido 
       WHERE p.id_pedido = ? AND p.empresa_id = ?`,
      [id_pedido, req.user.empresa_id]
    );

    if (pedidoExistente.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Pedido no encontrado o no pertenece a tu empresa' 
      });
    }

    if (pedidoExistente[0].id_transportista) {
      return res.status(400).json({ 
        success: false, 
        message: 'Este pedido ya tiene un transportista asignado' 
      });
    }
    const [transportista] = await connection.query(
      'SELECT * FROM transportistas WHERE id_transportista = ? AND estado = "Libre" AND empresa_id = ?',
      [id_transportista, req.user.empresa_id]
    );

    if (transportista.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Transportista no disponible o no pertenece a tu empresa' 
      });
    }
    const [envioExistente] = await connection.query(
      'SELECT * FROM envios WHERE id_pedido = ?',
      [id_pedido]
    );

    if (envioExistente.length === 0) {
      await connection.query(
        'INSERT INTO envios (id_pedido, id_transportista, estado, empresa_id) VALUES (?, ?, "PENDIENTE", ?)',
        [id_pedido, id_transportista, req.user.empresa_id]
      );
    } else {
      await connection.query(
        'UPDATE envios SET id_transportista = ?, estado = "PENDIENTE" WHERE id_pedido = ?',
        [id_transportista, id_pedido]
      );
    }
    console.log(`✅ Transportista ${id_transportista} asignado - Sigue DISPONIBLE (no ocupado)`);
    
    const [pedidoActualizado] = await connection.query(
      `SELECT p.*, e.estado, t.nombre as transportista_nombre 
       FROM pedidos p 
       LEFT JOIN envios e ON p.id_pedido = e.id_pedido 
       LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista 
       WHERE p.id_pedido = ?`,
      [id_pedido]
    );

    console.log('Transportista asignado correctamente');
    
    res.json({ 
      success: true, 
      message: 'Transportista asignado correctamente',
      pedido: pedidoActualizado[0]
    });

  } catch (error) {
    console.error('❌ Error asignando transportista:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor: ' + error.message 
    });
  } finally {
    if (connection) connection.release();
  }
});
router.get('/transportista/:transportistaId/viajes', authMiddleware, async (req, res) => {
    const { transportistaId } = req.params;
    
    console.log('🔄 Obteniendo viajes para transportista:', transportistaId);
    console.log('🏢 Empresa del usuario:', req.user.empresa_id);

    try {
        const [empresaCheck] = await pool.query(
            'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
            [transportistaId]
        );
        
        if (empresaCheck.length === 0 || empresaCheck[0].empresa_id !== req.user.empresa_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para ver estos viajes.' 
            });
        }

        const sql = `
            SELECT 
                e.id_envio,
                p.id_pedido,
                p.direccion_origen,
                p.direccion_destino,
                p.fecha_envio,
                p.tipo_carga,
                p.descripcion,
                ROUND(p.costo * 0.3, 2) as costo,          
                p.costo as costo_total, 
                p.latitud_origen,
                p.longitud_origen,
                p.latitud_destino,
                p.longitud_destino,
                e.estado,
                c.cedula as cliente_cedula,
                u.correo as cliente_email,
                p.fecha_creacion
            FROM envios e
            JOIN pedidos p ON e.id_pedido = p.id_pedido
            LEFT JOIN clientes c ON p.id_cliente = c.id_cliente
            LEFT JOIN usuarios u ON c.id_usuario = u.id_usuario
            WHERE e.id_transportista = ?
            AND p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC
        `;

        const [rows] = await pool.query(sql, [transportistaId, req.user.empresa_id]);
        
        console.log(`✅ Encontrados ${rows.length} viajes para transportista ${transportistaId}`);
        
        res.json({
            success: true,
            viajes: rows.map(viaje => ({
                ...viaje,
                fecha_envio: viaje.fecha_envio ? new Date(viaje.fecha_envio).toISOString().split('T')[0] : null,
                fecha_creacion: viaje.fecha_creacion ? new Date(viaje.fecha_creacion).toISOString() : null
            }))
        });

    } catch (error) {
        console.error('❌ Error al obtener viajes del transportista:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.get('/transportista/:transportistaId/historial', authMiddleware, async (req, res) => {
    const { transportistaId } = req.params;
    
    console.log('Obteniendo historial para transportista:', transportistaId);
    console.log('Empresa del usuario:', req.user.empresa_id);

    try {
        const [empresaCheck] = await pool.query(
            'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
            [transportistaId]
        );
        
        if (empresaCheck.length === 0 || empresaCheck[0].empresa_id !== req.user.empresa_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para ver este historial.' 
            });
        }

        const sql = `
            SELECT 
                e.id_envio,
                p.id_pedido,
                p.direccion_origen,
                p.direccion_destino,
                p.fecha_envio,
                p.tipo_carga,
                p.descripcion,
                ROUND(p.costo * 0.3, 2) as costo,          
                p.costo as costo_total,
                e.estado,
                p.fecha_creacion
            FROM envios e
            JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE e.id_transportista = ? 
            AND e.estado = 'ENTREGADO'
            AND p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC
            LIMIT 20
        `;

        const [rows] = await pool.query(sql, [transportistaId, req.user.empresa_id]);
        
        console.log(`✅ Encontrados ${rows.length} viajes en historial`);
        
        res.json({
            success: true,
            viajes: rows.map(viaje => ({
                ...viaje,
                fecha_envio: viaje.fecha_envio ? new Date(viaje.fecha_envio).toISOString().split('T')[0] : null,
                fecha_creacion: viaje.fecha_creacion ? new Date(viaje.fecha_creacion).toISOString() : null
            }))
        });

    } catch (error) {
        console.error('❌ Error al obtener historial:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.get('/transportista/:transportistaId/estadisticas', authMiddleware, async (req, res) => {
    const { transportistaId } = req.params;
    
    try {
        console.log('CALCULANDO ESTADÍSTICAS PARA:', transportistaId);
        
        const [viajes] = await pool.query(
            `SELECT COUNT(*) as total FROM envios 
             WHERE id_transportista = ? AND estado = 'ENTREGADO'`,
            [transportistaId]
        );
        
        const [ingresos] = await pool.query(
            `SELECT SUM(p.costo * 0.3) as total FROM envios e
             JOIN pedidos p ON e.id_pedido = p.id_pedido
             WHERE e.id_transportista = ? AND e.estado = 'ENTREGADO'`,
            [transportistaId]
        );
        
        let kmTotal = 0;
        
        const [pedidos] = await pool.query(
            `SELECT DISTINCT u.id_pedido 
             FROM ubicaciones u
             JOIN envios e ON e.id_pedido = u.id_pedido
             WHERE e.id_transportista = ? AND e.estado = 'ENTREGADO'`,
            [transportistaId]
        );
        
        console.log(`Procesando ${pedidos.length} pedidos...`);
        
        for (const pedido of pedidos) {
            const [ubicaciones] = await pool.query(
                `SELECT latitud, longitud, fecha 
                 FROM ubicaciones 
                 WHERE id_pedido = ? 
                 ORDER BY fecha ASC`,
                [pedido.id_pedido]
            );
            
            if (ubicaciones.length < 2) continue;
            
            let kmPedido = 0;
            let ultimaLat = null;
            let ultimaLng = null;
            let ultimoTiempo = null;
            
            for (let i = 0; i < ubicaciones.length; i++) {
                const lat = parseFloat(ubicaciones[i].latitud);
                const lng = parseFloat(ubicaciones[i].longitud);
                const fecha = new Date(ubicaciones[i].fecha);
                
                if ((lat === 0 && lng === 0) || lat < -30 || lat > -20 || lng < -62 || lng > -54) {
                    continue;
                }
                
                if (ultimaLat !== null && ultimoTiempo !== null) {
                    const diffTiempo = (fecha - ultimoTiempo) / 1000;
                    
                    if (diffTiempo >= 10) {
                        const R = 6371;
                        const lat1 = ultimaLat * Math.PI / 180;
                        const lng1 = ultimaLng * Math.PI / 180;
                        const lat2 = lat * Math.PI / 180;
                        const lng2 = lng * Math.PI / 180;
                        
                        const dLat = lat2 - lat1;
                        const dLng = lng2 - lng1;
                        
                        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                                 Math.cos(lat1) * Math.cos(lat2) *
                                 Math.sin(dLng/2) * Math.sin(dLng/2);
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                        const distancia = R * c;
                        
                        if (distancia < 5) {
                            kmPedido += distancia;
                        }
                    }
                }
                
                ultimaLat = lat;
                ultimaLng = lng;
                ultimoTiempo = fecha;
            }
            
            kmTotal += Math.round(kmPedido * 10) / 10;
        }
        
        const viajesCount = viajes[0]?.total || 0;
        const ingresosTotal = ingresos[0]?.total || 0;
        const kmFinal = Math.round(kmTotal * 10) / 10;
        
        console.log('RESULTADOS:', {
            viajes: viajesCount,
            ingresos: ingresosTotal,
            km_reales: kmFinal
        });
        
        res.json({
            success: true,
            estadisticas: {
                viajes_completados: viajesCount,
                ingresos_totales: ingresosTotal,
                km_recorridos: kmFinal > 0 ? kmFinal : (viajesCount * 25)
            }
        });
        
    } catch (error) {
        console.error('ERROR:', error);
        
        const [viajes] = await pool.query(
            `SELECT COUNT(*) as total FROM envios 
             WHERE id_transportista = ? AND estado = 'ENTREGADO'`,
            [transportistaId]
        );
        const viajesCount = viajes[0]?.total || 0;
        
        res.json({
            success: true,
            estadisticas: {
                viajes_completados: viajesCount,
                ingresos_totales: 0,
                km_recorridos: viajesCount * 25
            }
        });
    }
});
router.put('/:envioId/finalizar', authMiddleware, async (req, res) => {
  try {
    const { envioId } = req.params;
    const { distancia_km } = req.body;
    
    await pool.query(
      `UPDATE envios 
       SET estado = 'ENTREGADO',
           fecha_entrega = NOW(),
           distancia_km = ?  
       WHERE id_envio = ?`,
      [distancia_km || 0, envioId]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
router.post('/ubicacion', authMiddleware, async (req, res) => {
    const { transportistaId, latitud, longitud, id_pedido } = req.body;

    console.log('📍 Actualizando ubicación:', { transportistaId, latitud, longitud, id_pedido });
    console.log('🏢 Empresa del usuario:', req.user.empresa_id);

    if (!transportistaId || !latitud || !longitud) {
        return res.status(400).json({ 
            success: false, 
            message: 'Datos de ubicación incompletos' 
        });
    }

    try {

        const [empresaCheck] = await pool.query(
            'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
            [transportistaId]
        );
        
        if (empresaCheck.length === 0 || empresaCheck[0].empresa_id !== req.user.empresa_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para actualizar esta ubicación.' 
            });
        }
        if (id_pedido) {
            const [pedidoCheck] = await pool.query(
                'SELECT empresa_id FROM pedidos WHERE id_pedido = ?',
                [id_pedido]
            );
            
            if (pedidoCheck.length === 0 || pedidoCheck[0].empresa_id !== req.user.empresa_id) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'No tienes permisos para actualizar la ubicación de este pedido.' 
                });
            }
        }
        await pool.query(
            `INSERT INTO ubicaciones (id_transportista, id_pedido, latitud, longitud, fecha, empresa_id) 
             VALUES (?, ?, ?, ?, NOW(), ?)`,
            [transportistaId, id_pedido || null, latitud, longitud, req.user.empresa_id]
        );

        console.log('Ubicación actualizada correctamente');
        
        res.json({ 
            success: true, 
            message: 'Ubicación actualizada correctamente'
        });

    } catch (error) {
        console.error('❌ Error al actualizar ubicación:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.put('/envios/:envioId/confirmar-llegada', authMiddleware, async (req, res) => {
  const { envioId } = req.params;
  
  console.log('🚚 Confirmando llegada del transportista:', envioId);
  console.log('🏢 Empresa del usuario:', req.user.empresa_id);

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [envioRows] = await connection.query(`
      SELECT 
        e.id_envio,
        e.id_pedido,
        e.id_transportista,
        e.estado,
        p.id_cliente,
        p.empresa_id,
        p.direccion_origen,
        p.direccion_destino,
        t.nombre as transportista_nombre
      FROM envios e
      JOIN pedidos p ON e.id_pedido = p.id_pedido
      JOIN transportistas t ON e.id_transportista = t.id_transportista
      WHERE e.id_envio = ? AND p.empresa_id = ?
    `, [envioId, req.user.empresa_id]);

    if (envioRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Envío no encontrado' 
      });
    }

    const envio = envioRows[0];
    await connection.query(
      `UPDATE envios SET estado = 'EN CAMINO' WHERE id_envio = ?`,
      [envioId]
    );
    const io = req.app.get('io');
    if (io) {
      const notificacionSocket = {
        id_notificacion: null, 
        notificationId: Date.now(), 
        empresa_id: envio.empresa_id,
        id_cliente: envio.id_cliente,
        id_pedido: envio.id_pedido,
        titulo: titulo,
        mensaje: mensaje,
        tipo: 'info',
        leida: false,
        fecha_creacion: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        etapa: 'llegada_origen'
      };
      io.to(`cliente_${envio.id_cliente}`).emit('nueva_notificacion', notificacionSocket);
      io.to(`envio_tracking_${envio.id_pedido}`).emit('transportista-llego-origen', {
        envioId: envioId,
        pedidoId: envio.id_pedido,
        transportistaId: envio.id_transportista,
        transportistaNombre: envio.transportista_nombre,
        timestamp: new Date(),
        mensaje: 'El transportista llegó al punto de retiro'
      });
      
      console.log(`📢 Notificación de llegada enviada a cliente ${envio.id_cliente}`);
    }

    await connection.commit();
    
    console.log('✅ Llegada del transportista confirmada:', {
      envioId,
      clienteId: envio.id_cliente,
      transportista: envio.transportista_nombre
    });

    res.json({
      success: true,
      message: 'Llegada confirmada y cliente notificado',
      notificacion: {
        titulo: titulo,
        mensaje: mensaje,
        clienteId: envio.id_cliente,
        pedidoId: envio.id_pedido
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Error confirmando llegada:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor: ' + error.message 
    });
  } finally {
    if (connection) connection.release();
  }
});
router.put('/corregir-estado-transportistas', authMiddleware, async (req, res) => {
    try {
        console.log('🔄 Corrigiendo estado de transportistas...');
        console.log('🏢 Empresa del usuario:', req.user.empresa_id);
        const [result] = await pool.query(
            `UPDATE transportistas t
             SET t.estado = 'Libre'
             WHERE t.estado = 'Ocupado'
             AND t.empresa_id = ?
             AND NOT EXISTS (
                 SELECT 1 FROM envios e 
                 WHERE e.id_transportista = t.id_transportista 
                 AND e.estado IN ('PENDIENTE', 'ACEPTADO', 'EN CAMINO')
             )`,
            [req.user.empresa_id]
        );

        console.log(`✅ Transportistas corregidos para empresa ${req.user.empresa_id}: ${result.affectedRows}`);
        
        res.json({ 
            success: true, 
            message: `Se corrigió el estado de ${result.affectedRows} transportistas`,
            transportistas_corregidos: result.affectedRows
        });

    } catch (error) {
        console.error('❌ Error al corregir estados:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.get('/debug/sistema', authMiddleware, async (req, res) => {
    try {
        console.log('🔍 Debug: Obteniendo información completa del sistema...');
        console.log('🏢 Empresa del usuario:', req.user.empresa_id);
        const [pedidos] = await pool.query(`
            SELECT 
                p.*, 
                e.estado as estado_envio,
                e.id_transportista,
                t.nombre as transportista_nombre,
                t.estado as estado_transportista,
                c.cedula,
                u.correo
            FROM pedidos p
            LEFT JOIN envios e ON p.id_pedido = e.id_pedido
            LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista
            LEFT JOIN clientes c ON p.id_cliente = c.id_cliente
            LEFT JOIN usuarios u ON c.id_usuario = u.id_usuario
            WHERE p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC`,
            [req.user.empresa_id]
        );
    
        const [transportistas] = await pool.query(
            'SELECT * FROM transportistas WHERE empresa_id = ? ORDER BY estado, id_transportista',
            [req.user.empresa_id]
        );
        const [estadisticas] = await pool.query(`
            SELECT 
                COUNT(*) as total_pedidos,
                SUM(CASE WHEN e.estado IS NULL THEN 1 ELSE 0 END) as pedidos_sin_asignar,
                SUM(CASE WHEN e.estado = 'PENDIENTE' THEN 1 ELSE 0 END) as pedidos_pendientes,
                SUM(CASE WHEN e.estado = 'ENTREGADO' THEN 1 ELSE 0 END) as pedidos_entregados
            FROM pedidos p
            LEFT JOIN envios e ON p.id_pedido = e.id_pedido
            WHERE p.empresa_id = ?`,
            [req.user.empresa_id]
        );

        res.json({
            pedidos: {
                total: pedidos.length,
                lista: pedidos,
                estadisticas: estadisticas[0]
            },
            transportistas: {
                total: transportistas.length,
                lista: transportistas,
                libres: transportistas.filter(t => t.estado === 'Libre').length,
                ocupados: transportistas.filter(t => t.estado === 'Ocupado').length
            },
            sistema: {
                timestamp: new Date().toISOString(),
                base_datos: 'transportadora_online',
                empresa_id: req.user.empresa_id,
                endpoints_funcionando: [
                    'GET /todos',
                    'POST /registro-rapido',
                    'POST /nuevo-pedido',
                    'POST /asignar-transportista', 
                    'GET /transportista/:id/viajes',
                    'PUT /envios/:id/estado',
                    'POST /geocoding/reverse',
                    'POST /geocoding/forward'
                ]
            }
        });
        
    } catch (error) {
        console.error('❌ Error en debug sistema:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.get('/tipos-estadisticas', authMiddleware, async (req, res) => {
    try {
        console.log('📊 Obteniendo estadísticas de tipos de pedido...');
        
        const sql = `
            SELECT 
                tipo_carga,
                COUNT(*) as total_pedidos,
                SUM(costo) as ingresos_totales,
                AVG(costo) as promedio_ingreso,
                COUNT(CASE WHEN e.estado = 'ENTREGADO' THEN 1 END) as entregados,
                COUNT(CASE WHEN e.estado = 'PENDIENTE' THEN 1 END) as pendientes
            FROM pedidos p
            LEFT JOIN envios e ON p.id_pedido = e.id_pedido
            WHERE p.empresa_id = ?
            GROUP BY tipo_carga
            ORDER BY total_pedidos DESC
        `;
        
        const [rows] = await pool.query(sql, [req.user.empresa_id]);
        
        console.log(`Estadísticas de tipos obtenidas: ${rows.length} categorías`);
        
        res.json({
            success: true,
            estadisticas: rows
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de tipos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.get('/envios/:envioId/cliente-info', authMiddleware, async (req, res) => {
    const { envioId } = req.params;
    
    try {
        const sql = `
            SELECT c.cedula, c.telefono, c.id_cliente
            FROM envios e
            JOIN pedidos p ON e.id_pedido = p.id_pedido
            JOIN clientes c ON p.id_cliente = c.id_cliente
            WHERE e.id_envio = ? AND p.empresa_id = ?
        `;
        
        const [rows] = await pool.query(sql, [envioId, req.user.empresa_id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Envío no encontrado' 
            });
        }
        
        res.json({
            success: true,
            cliente: rows[0]
        });
        
    } catch (error) {
        console.error('❌ Error al obtener info del cliente:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});
module.exports = router;
