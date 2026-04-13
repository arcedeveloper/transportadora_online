const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./models/database');

let io;

const setupWebSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: ["http://127.0.0.1:5500", "http://localhost:5500", "http://localhost:3000", "http://192.168.100.9:3000", "http://192.168.100.9"],
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    io.use((socket, next) => {
        try {
            let token = socket.handshake.auth.token;
            
            if (!token) {
                token = socket.handshake.query.token;
            }
            
            if (!token) {
                token = socket.handshake.headers.authorization?.replace('Bearer ', '');
            }

            console.log('Token extraído:', token ? token.substring(0, 20) + '...' : 'NO HAY TOKEN');

            if (token && token !== 'null') {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    console.log('Token decodificado - ID:', decoded.id_cliente || decoded.empresa_id);
                    
                    socket.user = {
                        id_usuario: decoded.id_cliente || decoded.empresa_id,
                        empresa_id: decoded.empresa_id,
                        tipo: decoded.tipo,
                        correo: decoded.correo,
                        nombre_empresa: decoded.nombre_empresa,
                        id_cliente: decoded.id_cliente
                    };
                    
                    console.log('Usuario autenticado:', socket.user.id_usuario, '- Tipo:', socket.user.tipo);
                } catch (error) {
                    console.log('Token inválido:', error.message);
                    socket.user = { 
                        id_usuario: 'anonymous', 
                        tipo: 'cliente'
                    };
                }
            } else {
                console.log('Conexión sin token - Cliente probable');
                socket.user = { 
                    id_usuario: 'anonymous', 
                    tipo: 'cliente' 
                };
            }
            
            next();
        } catch (error) {
            console.log('Error en middleware WebSocket:', error.message);
            socket.user = { 
                id_usuario: 'error_user', 
                tipo: 'cliente' 
            };
            next();
        }
    });

    io.on('connection', (socket) => {
        console.log('🔗 Nueva conexión WebSocket - ID:', socket.id);
        console.log('👤 Usuario:', socket.user.id_usuario, '- Tipo:', socket.user.tipo);
 
        socket.on('unirse-cliente', (clienteId) => {
            if (!clienteId) {
                console.log('ID de cliente no proporcionado');
                return;
            }
            
            const roomName = `cliente_${clienteId}`;
            socket.join(roomName);
            
            const rooms = Array.from(socket.rooms);
            console.log(`👤 Cliente ${clienteId} unido a sala: ${roomName}`);
            console.log(`📋 Salas del socket ${socket.id}:`, rooms);
            
            const allRooms = io.sockets.adapter.rooms;
            console.log('🏢 Todas las salas activas:');
            allRooms.forEach((sockets, room) => {
                if (room.includes('cliente_')) {
                    console.log(`   - ${room}: ${sockets.size} clientes`);
                }
            });
            
            socket.emit('sala-unida', { 
                success: true, 
                room: roomName,
                message: `Unido a sala de notificaciones del cliente ${clienteId}`
            });
        });

        socket.on('suscribir-notificaciones', (data) => {
            const { clienteId } = data;
            if (!clienteId) {
                console.log('❌ ID de cliente no proporcionado en suscripción');
                return;
            }
            
            const roomName = `notificaciones_cliente_${clienteId}`;
            socket.join(roomName);
            console.log(`📢 Cliente ${clienteId} suscrito a notificaciones: ${roomName}`);
        });

        socket.on('verificar-salas', (data) => {
            const { clienteId } = data;
            const rooms = Array.from(socket.rooms);
            console.log(`🔍 Verificando salas para cliente ${clienteId}:`, rooms);
            
            socket.emit('estado-salas', {
                clienteId,
                salas: rooms.filter(room => room.includes(`cliente_${clienteId}`)),
                totalSalas: rooms.length
            });
        });

        socket.on('debug-notificacion', (data) => {
            console.log('🐛 DEBUG Notificación:', data);
            const { clienteId, mensaje } = data;
            
            if (clienteId && io) {
                const roomName = `cliente_${clienteId}`;
                const rooms = io.sockets.adapter.rooms;
                
                console.log(`🔍 Verificando sala ${roomName}:`, rooms.has(roomName));
                console.log(`👥 Clientes en sala ${roomName}:`, rooms.get(roomName)?.size || 0);
                
                io.to(roomName).emit('nueva_notificacion', {
                    id_notificacion: Date.now(),
                    empresa_id: 1,
                    id_cliente: clienteId,
                    id_pedido: 1,
                    titulo: 'Notificación de Prueba',
                    mensaje: mensaje || 'Esta es una notificación de prueba',
                    tipo: 'info',
                    leida: false,
                    fecha_creacion: new Date().toISOString()
                });
            }
        });

        socket.on('unirse-empresa-tracking', (empresaId) => {
            if (!empresaId) {
                console.log('ID de empresa no proporcionado para tracking');
                return;
            }
            
            const roomName = `tracking_empresa_${empresaId}`;
            socket.join(roomName);
            
            console.log(`🏢 Empresa ${empresaId} unida a tracking: ${roomName}`);
            
            socket.emit('empresa-tracking-unida', { 
                success: true, 
                room: roomName,
                message: `Empresa ${empresaId} unida al tracking en tiempo real`
            });

            const allRooms = io.sockets.adapter.rooms;
            console.log('📍 Salas de tracking activas:');
            allRooms.forEach((sockets, room) => {
                if (room.includes('tracking_empresa_')) {
                    console.log(`   - ${room}: ${sockets.size} empresas`);
                }
            });
        });

        socket.on('unirse-transportista-tracking', (data) => {
            const { transportistaId, empresaId, transportistaNombre } = data;
            
            if (!transportistaId || !empresaId) {
                console.log('❌ Datos incompletos para transportista tracking');
                return;
            }
            
            const roomTransportista = `tracking_transportista_${transportistaId}`;
            socket.join(roomTransportista);
            
            const roomEmpresa = `tracking_empresa_${empresaId}`;
            socket.join(roomEmpresa);
            
            console.log(`🚚 Transportista ${transportistaNombre} (${transportistaId}) unido a tracking`);
            console.log(`   - Sala empresa: ${roomEmpresa}`);
            console.log(`   - Sala transportista: ${roomTransportista}`);
            
            io.to(roomEmpresa).emit('transportista-online', {
                transportistaId: transportistaId,
                transportistaNombre: transportistaNombre,
                empresaId: empresaId,
                socketId: socket.id,
                timestamp: new Date(),
                tipo: 'tracking'
            });
        });

        socket.on('ubicacion-transportista', async (data) => {
            console.log('📍📍📍 UBICACIÓN RECIBIDA VÍA WEBSOCKET:', {
                transportista: data.transportistaId,
                empresa: data.empresaId,
                pedido: data.pedidoId,
                envio: data.envioId,
                etapa: data.etapa,
                ubicacion: `${data.latitud}, ${data.longitud}`,
                progreso: `${(data.progreso * 100).toFixed(0)}%`
            });

            if (!data.transportistaId || !data.empresaId || !data.latitud || !data.longitud) {
                console.log('❌ Datos incompletos en ubicación WebSocket');
                return;
            }

            try {
                let id_envio = data.envioId;
                let id_pedido = data.pedidoId;
                let query;
                let params = [];

                if (id_envio) {
                    console.log(`🔍 Buscando por ID de envío: ${id_envio}`);
                    query = `
                        SELECT 
                            e.id_envio,
                            e.id_pedido,
                            e.estado,
                            e.id_transportista,
                            e.empresa_id,
                            p.direccion_origen,
                            p.direccion_destino
                        FROM envios e
                        INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
                        WHERE e.id_envio = ? 
                        AND e.empresa_id = ?
                        AND e.estado IN ('PENDIENTE', 'ACEPTADO', 'EN CAMINO')
                    `;
                    params = [id_envio, data.empresaId];
                } else if (id_pedido) {
                    console.log(`🔍 Buscando por ID de pedido: ${id_pedido}`);
                    query = `
                        SELECT 
                            e.id_envio,
                            e.id_pedido,
                            e.estado,
                            e.id_transportista,
                            e.empresa_id,
                            p.direccion_origen,
                            p.direccion_destino
                        FROM envios e
                        INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
                        WHERE e.id_pedido = ?
                        AND e.empresa_id = ?
                        AND e.estado IN ('PENDIENTE', 'ACEPTADO', 'EN CAMINO')
                    `;
                    params = [id_pedido, data.empresaId];
                } else {
                    console.log('❌❌❌ ERROR: Se requiere envioId o pedidoId');
                    socket.emit('ubicacion-error', {
                        success: false,
                        error: 'Se requiere envioId o pedidoId',
                        timestamp: new Date()
                    });
                    return;
                }

                const [resultados] = await pool.query(query, params);
                if (resultados.length === 0) {
                    console.log(`❌❌❌ ENVÍO NO ENCONTRADO o estado inválido:`);
                    console.log(`   - Envio ID: ${id_envio}`);
                    console.log(`   - Pedido ID: ${id_pedido}`);
                    console.log(`   - Empresa: ${data.empresaId}`);
                    console.log(`   - Estados válidos: PENDIENTE, ACEPTADO, EN CAMINO`);
                    
                    socket.emit('ubicacion-error', {
                        success: false,
                        error: `Envío no encontrado o estado inválido. Estados válidos: PENDIENTE, ACEPTADO, EN CAMINO`,
                        timestamp: new Date()
                    });
                    return;
                }

                const envioInfo = resultados[0];
                id_envio = envioInfo.id_envio;
                id_pedido = envioInfo.id_pedido;

                console.log(`Envío verificado (JOIN pedidos+envios):`);
                console.log(`   - Envío: ${envioInfo.id_envio}`);
                console.log(`   - Pedido: ${envioInfo.id_pedido}`);
                console.log(`   - Estado: ${envioInfo.estado}`);
                console.log(`   - Empresa: ${envioInfo.empresa_id}`);
                console.log(`   - Transportista BD: ${envioInfo.id_transportista}`);
                console.log(`   - Transportista WS: ${data.transportistaId}`);
                console.log(`   - Origen: ${envioInfo.direccion_origen}`);
                console.log(`   - Destino: ${envioInfo.direccion_destino}`);

                if (envioInfo.id_transportista != data.transportistaId) {
                    console.log(`⚠️  ADVERTENCIA: Transportista no coincide`);
                    console.log(`   - BD: ${envioInfo.id_transportista}`);
                    console.log(`   - WS: ${data.transportistaId}`);
                }
                if (envioInfo.empresa_id != data.empresaId) {
                    console.log(`❌ ERROR: Empresa no coincide`);
                    console.log(`   - BD: ${envioInfo.empresa_id}`);
                    console.log(`   - WS: ${data.empresaId}`);
                    socket.emit('ubicacion-error', {
                        success: false,
                        error: 'Empresa no coincide con el envío',
                        timestamp: new Date()
                    });
                    return;
                }

                const [result] = await pool.query(
                    `INSERT INTO ubicaciones (empresa_id, id_transportista, id_pedido, latitud, longitud, fecha) 
                     VALUES (?, ?, ?, ?, ?, NOW())`,
                    [
                        data.empresaId,
                        data.transportistaId,
                        id_pedido, 
                        parseFloat(data.latitud),
                        parseFloat(data.longitud)
                    ]
                );

                console.log(`Ubicación guardada en BD - ID: ${result.insertId}, Pedido: ${id_pedido}, Envío: ${id_envio}`);

                const roomEmpresa = `tracking_empresa_${data.empresaId}`;
                
                const ubicacionData = {
                    transportistaId: data.transportistaId,
                    transportistaNombre: data.transportistaNombre,
                    empresaId: data.empresaId,
                    envioId: id_envio,
                    pedidoId: id_pedido,
                    estado: envioInfo.estado,
                    latitud: parseFloat(data.latitud),
                    longitud: parseFloat(data.longitud),
                    etapa: data.etapa || 'EN CAMINO',
                    progreso: data.progreso || 0,
                    timestamp: new Date(),
                    tipo: 'REAL',
                    ubicacionId: result.insertId,
                    direccionOrigen: envioInfo.direccion_origen,
                    direccionDestino: envioInfo.direccion_destino
                };

                socket.to(roomEmpresa).emit('ubicacion-actualizada', ubicacionData);
                const salaEnvio = `envio_tracking_${id_envio}`;    
                const salaPedido = `envio_tracking_${id_pedido}`;   

                const rooms = io.sockets.adapter.rooms;
                const existeSalaEnvio = rooms.has(salaEnvio);
                const existeSalaPedido = rooms.has(salaPedido);
                const clientesEnSalaEnvio = existeSalaEnvio ? rooms.get(salaEnvio).size : 0;
                const clientesEnSalaPedido = existeSalaPedido ? rooms.get(salaPedido).size : 0;

                console.log(`📡📡📡 EMITIENDO UBICACIÓN A AMBAS SALAS 📡📡📡`);
                console.log(`   - Sala Envío (${id_envio}): ${salaEnvio} - Clientes: ${clientesEnSalaEnvio}`);
                console.log(`   - Sala Pedido (${id_pedido}): ${salaPedido} - Clientes: ${clientesEnSalaPedido}`);

                const ubicacionClienteData = {
                    transportistaId: data.transportistaId,
                    transportistaNombre: data.transportistaNombre,
                    envioId: id_envio,
                    pedidoId: id_pedido,
                    latitud: data.latitud,
                    longitud: data.longitud,
                    etapa: data.etapa || 'EN CAMINO',
                    progreso: data.progreso || 0,
                    timestamp: new Date(),
                    direccionOrigen: envioInfo.direccion_origen,
                    direccionDestino: envioInfo.direccion_destino
                };
                io.to(salaEnvio).emit('ubicacion-transportista-cliente', ubicacionClienteData);
                const etapa = data.etapa || 'EN CAMINO';
const etapasPermitidasParaCliente = ['en_origen', 'yendo_origen', 'en_viaje', 'en_destino', 'completado', 'en_ubicacion'];

if (etapasPermitidasParaCliente.includes(etapa.toLowerCase())) {
    console.log(`ENVIANDO al cliente - Etapa permitida: ${etapa}`);
    io.to(salaPedido).emit('ubicacion-transportista-cliente', ubicacionClienteData);
} else {
    console.log(`OMITIENDO para cliente - Etapa: ${etapa}`);
}

                console.log(`EMITIDO (Empresa: siempre, Cliente: solo desde origen)`);
if (etapa.toLowerCase() === 'yendo_origen' || 
    etapa.toLowerCase() === 'en_origen' || 
    etapa.toLowerCase() === 'en_ubicacion' || 
    etapa.toLowerCase() === 'en_destino') {
    
    const claveEtapa = `ultima_etapa_${id_envio}`;
    
    if (!socket[claveEtapa] || socket[claveEtapa] !== etapa.toLowerCase()) {
        console.log(`🔔 NOTIFICANDO AL CLIENTE - Etapa NUEVA: ${etapa}`);
        
        const [clienteInfo] = await pool.query(`
            SELECT p.id_cliente 
            FROM pedidos p 
            WHERE p.id_pedido = ?
        `, [id_pedido]);

        if (clienteInfo.length > 0) {
            const clienteId = clienteInfo[0].id_cliente;
            
            let titulo, mensaje;
            
            if (etapa.toLowerCase() === 'yendo_origen') {
                titulo = '🚚 Transportista en Camino al Retiro';
                mensaje = `El transportista ha salido de la empresa y está en camino al punto de retiro.`;
            } 
            else if (etapa.toLowerCase() === 'en_origen') {
                titulo = '📍 Transportista en el Punto de Retiro';
                mensaje = `El transportista ha llegado al punto de retiro.`;
            }
            else if (etapa.toLowerCase() === 'en_destino') {
                titulo = '🎯 Transportista ha Llegado al Destino';
                mensaje = `El transportista ha llegado al punto de entrega en ${envioInfo.direccion_destino}.`;
            }
            else {
                return;
            }
            const [notificacionesExistentes] = await pool.query(
                `SELECT id_notificacion FROM notificaciones 
                 WHERE empresa_id = ? 
                 AND id_cliente = ? 
                 AND id_pedido = ? 
                 AND titulo = ? 
                 AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
                 LIMIT 1`,
                [data.empresaId, clienteId, id_pedido, titulo]
            );
            
            if (notificacionesExistentes.length > 0) {
                console.log(`⏭️  Ya existe notificación similar (en los últimos 60 segundos) - NO insertar`);
                socket[claveEtapa] = etapa.toLowerCase();
                return;
            }
            
            const [insertResult] = await pool.query(
                `INSERT INTO notificaciones (empresa_id, id_cliente, id_pedido, titulo, mensaje, tipo, leida, fecha_creacion) 
                 VALUES (?, ?, ?, ?, ?, 'info', 0, NOW())`,
                [data.empresaId, clienteId, id_pedido, titulo, mensaje]
            );

            const notificacionData = {
                id_notificacion: insertResult.insertId,
                notificationId: insertResult.insertId,
                empresa_id: data.empresaId,
                id_cliente: clienteId,
                id_pedido: id_pedido,
                titulo: titulo,
                mensaje: mensaje,
                tipo: 'info',
                leida: false,
                fecha_creacion: new Date().toISOString(),
                timestamp: new Date().toISOString(),
                etapa: etapa.toLowerCase()
            };

            const salaCliente = `cliente_${clienteId}`;
            io.to(salaCliente).emit('nueva_notificacion', notificacionData);
            
            console.log(`📢 Notificación enviada a cliente ${clienteId}: ${titulo}`);
            
            socket[claveEtapa] = etapa.toLowerCase();
        }
    } else {
        console.log(`⏭️  Ya se notificó etapa ${etapa} para envío ${id_envio}`);
    }
}             socket.emit('ubicacion-confirmada', {
                    success: true,
                    ubicacionId: result.insertId,
                    envioId: id_envio,
                    pedidoId: id_pedido,
                    estado: envioInfo.estado,
                    timestamp: new Date(),
                    mensaje: 'Ubicación recibida y procesada'
                });

            } catch (error) {
                console.error('❌ Error procesando ubicación WebSocket:', error);
                
                socket.emit('ubicacion-error', {
                    success: false,
                    error: error.message,
                    timestamp: new Date()
                });
            }
        });

        socket.on('viaje-iniciado', async (data) => {
            console.log('🚀 VIAJE INICIADO VÍA WEBSOCKET:', {
                transportista: data.transportistaNombre,
                empresa: data.empresaId,
                envio: data.envioId,
                etapa: data.etapa
            });

            const roomEmpresa = `tracking_empresa_${data.empresaId}`;
            
            io.to(roomEmpresa).emit('transportista-en-viaje', {
                transportistaId: data.transportistaId,
                transportistaNombre: data.transportistaNombre,
                empresaId: data.empresaId,
                envioId: data.envioId,
                pedidoId: data.pedidoId,
                etapa: data.etapa || 'empresa',
                timestamp: new Date(),
                accion: 'inicio_viaje'
            });
            if (data.tipo === 'llegada_origen') {
                console.log(`📍 Notificando llegada al origen - Envío: ${data.envioId}, Pedido: ${data.pedidoId}`);
                
                const llegadaData = {
                    envioId: data.envioId,
                    pedidoId: data.pedidoId,
                    transportistaId: data.transportistaId,
                    timestamp: new Date(),
                    mensaje: 'El transportista llegó al punto de retiro'
                };
                
                const salaEnvio = `envio_tracking_${data.envioId}`;
                const salaPedido = `envio_tracking_${data.pedidoId}`;
                io.to(salaEnvio).emit('transportista-llego-origen', llegadaData);
                if (data.etapa && data.etapa.toLowerCase() === 'en_origen') {
                    console.log(`Notificando al cliente llegada al origen`);
                    io.to(salaPedido).emit('transportista-llego-origen', llegadaData);
                } else {
                    console.log(`⏭️  Omitiendo notificación para cliente - Etapa: ${data.etapa}`);
                }
                
                console.log(`📢 Notificado llegada a salas: ${salaEnvio} y ${salaPedido}`);
            }

            console.log(`📢 Empresa ${data.empresaId} notificada sobre inicio de viaje`);
        });

        socket.on('viaje-completado', async (data) => {
            console.log('✅ VIAJE COMPLETADO VÍA WEBSOCKET:', {
                transportista: data.transportistaId,
                empresa: data.empresaId,
                envio: data.envioId,
                pedido: data.pedidoId 
            });

            try {
                await pool.query(
                    'UPDATE envios SET estado = ? WHERE id_envio = ?',
                    ['ENTREGADO', data.envioId]
                );

                await pool.query(
                    'UPDATE transportistas SET estado = ? WHERE id_transportista = ?',
                    ['Libre', data.transportistaId]
                );

                const roomEmpresa = `tracking_empresa_${data.empresaId}`;
                
                io.to(roomEmpresa).emit('transportista-viaje-completado', {
                    transportistaId: data.transportistaId,
                    empresaId: data.empresaId,
                    envioId: data.envioId,
                    pedidoId: data.pedidoId,
                    timestamp: new Date(),
                    accion: 'viaje_completado',
                    mensaje: `Envío ${data.envioId} marcado como entregado`
                });
                const salaEnvio = `envio_tracking_${data.envioId}`;
                const salaPedido = `envio_tracking_${data.pedidoId}`;

                const estadoData = {
                    envioId: data.envioId,
                    pedidoId: data.pedidoId,
                    estado: 'ENTREGADO',
                    timestamp: new Date(),
                    mensaje: 'Pedido entregado exitosamente'
                };
                io.to(salaEnvio).emit('estado-envio-actualizado', estadoData);
                io.to(salaPedido).emit('estado-envio-actualizado', estadoData);

                console.log(`📢 Estado ENTREGADO emitido a salas: ${salaEnvio} y ${salaPedido}`);

            } catch (error) {
                console.error('Error actualizando estado de viaje completado:', error);
            }
        });

        socket.on('unirse-cliente-tracking', (data) => {
            console.log('🔍 CLIENTE INTENTANDO UNIRSE A TRACKING:');
            console.log('   - Datos recibidos:', data);
            console.log('   - clienteId:', data.clienteId);
            console.log('   - envioId:', data.envioId);
            console.log('   - ¿Tiene pedidoId?:', data.pedidoId);
            
            const { clienteId, envioId } = data;
            
            if (!clienteId || !envioId) {
                console.log('❌ Datos incompletos para cliente tracking');
                return;
            }
            
            const roomCliente = `cliente_tracking_${clienteId}`;
            const roomEnvio = `envio_tracking_${envioId}`;
            
            socket.join(roomCliente);
            socket.join(roomEnvio);
            
            console.log(`👤 Cliente ${clienteId} unido a tracking:`);
            console.log(`   - Sala cliente: ${roomCliente}`);
            console.log(`   - Sala envío: ${roomEnvio}`);
            const rooms = io.sockets.adapter.rooms;
            const existeSalaEnvio = rooms.has(roomEnvio);
            const clientesEnSalaEnvio = existeSalaEnvio ? rooms.get(roomEnvio).size : 0;
            
            console.log(`   - ¿Sala ${roomEnvio} existe?: ${existeSalaEnvio ? '✅ SÍ' : '❌ NO'}`);
            console.log(`   - Clientes en sala ${roomEnvio}: ${clientesEnSalaEnvio}`);
            
            socket.emit('cliente-tracking-unido', {
                success: true,
                clienteId: clienteId,
                envioId: envioId,
                salas: [roomCliente, roomEnvio],
                salaEnvio: roomEnvio,
                existeSala: existeSalaEnvio,
                clientesEnSala: clientesEnSalaEnvio,
                message: 'Conectado al seguimiento en tiempo real'
            });
        });

        socket.on('actualizar-estado-envio-cliente', async (data) => {
            const { envioId, estado, empresaId } = data;
            
            console.log(`🔄 Actualizando estado envío ${envioId} a: ${estado}`);
            
            try {
                await pool.query(
                    'UPDATE envios SET estado = ? WHERE id_envio = ?',
                    [estado, envioId]
                );
                                socket.to(`envio_tracking_${envioId}`).emit('estado-envio-actualizado', {
                    envioId: envioId,
                    estado: estado,
                    timestamp: new Date(),
                    mensaje: `Estado actualizado a: ${estado}`
                });
                
            } catch (error) {
                console.error('❌ Error actualizando estado:', error);
            }
        });
        socket.on('verificar-suscripcion-envio', (data) => {
            const { envioId } = data;
            const roomEnvio = `envio_tracking_${envioId}`;
            const estaEnSala = socket.rooms.has(roomEnvio);
            
            console.log(`🔍 Verificando suscripción envío ${envioId}:`);
            console.log(`   - Sala: ${roomEnvio}`);
            console.log(`   - ¿Cliente en sala?: ${estaEnSala ? '✅ SÍ' : '❌ NO'}`);
            console.log(`   - Socket ID: ${socket.id}`);
            console.log(`   - Salas del socket:`, Array.from(socket.rooms));
            
            socket.emit('respuesta-verificacion-envio', {
                envioId: envioId,
                suscrito: estaEnSala,
                sala: roomEnvio,
                salasCliente: Array.from(socket.rooms),
                timestamp: new Date()
            });
        });

        socket.on('debug-tracking', (data) => {
            console.log('🐛 DEBUG TRACKING:', data);
            const { envioId, clienteId, mensaje } = data;
            
            const roomEnvio = `envio_tracking_${envioId}`;
            const rooms = io.sockets.adapter.rooms;
            const existeSala = rooms.has(roomEnvio);
            const clientesEnSala = existeSala ? rooms.get(roomEnvio).size : 0;
            
            console.log(`🔍 Estado sala ${roomEnvio}:`);
            console.log(`   - ¿Existe?: ${existeSala}`);
            console.log(`   - Clientes en sala: ${clientesEnSala}`);
            console.log(`   - ¿Este socket en sala?: ${socket.rooms.has(roomEnvio)}`);
            
            socket.emit('debug-respuesta-tracking', {
                envioId: envioId,
                sala: roomEnvio,
                existeSala: existeSala,
                clientesEnSala: clientesEnSala,
                esteSocketEnSala: socket.rooms.has(roomEnvio),
                timestamp: new Date(),
                mensaje: mensaje || 'Debug recibido'
            });
        });

        socket.on('verificar-tracking-empresa', (empresaId) => {
            const roomEmpresa = `tracking_empresa_${empresaId}`;
            const rooms = io.sockets.adapter.rooms;
            
            const estaEnSala = rooms.has(roomEmpresa);
            const clientesEnSala = estaEnSala ? rooms.get(roomEmpresa).size : 0;
            
            console.log(`🔍 Estado tracking empresa ${empresaId}:`, {
                sala_existe: estaEnSala,
                clientes_conectados: clientesEnSala,
                sala: roomEmpresa
            });

            socket.emit('estado-tracking-empresa', {
                empresaId: empresaId,
                conectada: estaEnSala,
                clientesConectados: clientesEnSala,
                sala: roomEmpresa,
                timestamp: new Date()
            });
        });

        socket.on('join-chats-empresa', (data) => {
            const { empresaId } = data;
            if (!empresaId) return;

            const roomName = `empresa_chats_${empresaId}`;
            socket.join(roomName);
            console.log(`💬 Empresa ${empresaId} unida a sala de chats: ${roomName}`);
        });
        socket.on('join-chat', (data) => {
    const { chatId } = data;
    if (!chatId) {
        console.log('❌ ID de chat no proporcionado');
        return;
    }
    
    const roomName = `chat_${chatId}`;
    socket.join(roomName);
    
    console.log(`💬 Usuario unido al chat: ${roomName}`);
    console.log(`   - Socket ID: ${socket.id}`);
    console.log(`   - User ID: ${socket.user.id_usuario}`);
    console.log(`   - User Type: ${socket.user.tipo}`);
    const rooms = io.sockets.adapter.rooms;
    const existeSala = rooms.has(roomName);
    const clientesEnSala = existeSala ? rooms.get(roomName).size : 0;
    
    console.log(`   - ¿Sala existe?: ${existeSala ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   - Clientes en sala: ${clientesEnSala}`);
    
    socket.emit('chat-unido', {
        success: true,
        chatId: chatId,
        room: roomName,
        existeSala: existeSala,
        clientesEnSala: clientesEnSala,
        message: 'Unido al chat en tiempo real'
    });
});
socket.on('join-chats-transportista', (data) => {
    const { transportistaId } = data;
    if (!transportistaId) return;

    const roomName = `transportista_chats_${transportistaId}`;
    socket.join(roomName);
    console.log(`🚚 Transportista ${transportistaId} unido a sala de chats: ${roomName}`);
});
socket.on('join-chats-cliente', (data) => {
    const { clienteId } = data;
    if (!clienteId) return;

    const roomName = `cliente_chats_${clienteId}`;
    socket.join(roomName);
    console.log(`👤 Cliente ${clienteId} unido a sala de chats: ${roomName}`);
});

socket.on('enviar-mensaje-chat', async (data) => {
    console.log('💬💬💬 MENSAJE RECIBIDO VÍA WEBSOCKET:');
    console.log('   - Chat ID:', data.chatId);
    console.log('   - Remitente:', data.remitente_tipo);
    console.log('   - Mensaje:', data.mensaje?.substring(0, 100) + '...');

    try {
        const [result] = await pool.query(
            'INSERT INTO mensajes (chat_id, remitente_tipo, mensaje) VALUES (?, ?, ?)',
            [data.chatId, data.remitente_tipo, data.mensaje]
        );
        
        const mensajeId = result.insertId;
        console.log(`✅ Mensaje insertado en BD - ID: ${mensajeId}`);
        const [mensajeCompleto] = await pool.query(`
            SELECT 
                m.id,
                m.mensaje,
                m.remitente_tipo,
                m.enviado_en,
                m.leido,
                c.empresa_id,
                c.transportista_id,
                c.cliente_id
            FROM mensajes m
            JOIN chats c ON m.chat_id = c.id
            WHERE m.id = ?
        `, [mensajeId]);

        if (mensajeCompleto.length === 0) {
            console.log('❌ Mensaje no encontrado después de insertar');
            return;
        }

        const mensajeData = mensajeCompleto[0];
        const destinatarioTipo = data.remitente_tipo === 'cliente' ? 'transportista' : 'cliente';
        
        const [contadorResult] = await pool.query(`
            SELECT COUNT(*) as total_no_leidos 
            FROM mensajes 
            WHERE chat_id = ? 
            AND leido = 0 
            AND remitente_tipo = ?
        `, [data.chatId, destinatarioTipo]);

        const contadorDestinatario = contadorResult[0]?.total_no_leidos || 0;
        
        console.log(`📊 CONTADOR REAL DE MENSAJES NO LEÍDOS:`);
        console.log(`   - Chat ID: ${data.chatId}`);
        console.log(`   - Para destinatario (${destinatarioTipo}): ${contadorDestinatario}`);
        const datosEmitir = {
            chatId: parseInt(data.chatId),
            mensajeId: mensajeId,
            mensaje: data.mensaje,
            remitente_tipo: data.remitente_tipo,
            remitente: data.remitente_tipo, 
            timestamp: new Date().toISOString(),
            enviado_en: mensajeData.enviado_en,
            leido: false,
            empresa_id: mensajeData.empresa_id,
            transportista_id: mensajeData.transportista_id,
            cliente_id: mensajeData.cliente_id
        };
        const roomName = `chat_${data.chatId}`;
        const rooms = io.sockets.adapter.rooms;
        const existeSala = rooms.has(roomName);
        
        console.log(`📢 Emitiendo a sala: ${roomName}`);
        console.log(`   - ¿Sala existe?: ${existeSala ? '✅ SÍ' : '❌ NO'}`);
        
        io.to(roomName).emit('nuevo-mensaje', datosEmitir);
        console.log(`✅ Mensaje emitido correctamente a ${roomName}`);
        
        console.log('🔄🔄🔄 ACTUALIZANDO LISTA DE CHATS 🔄🔄🔄');
        
        const datosActualizacion = {
            chatId: parseInt(data.chatId),
            lastMessage: data.mensaje.length > 50 ? data.mensaje.substring(0, 50) + '...' : data.mensaje,
            lastMessageTime: new Date().toISOString(),
            unreadCount: contadorDestinatario, 
            shouldIncrement: true,
            timestamp: new Date().toISOString()
        };
        let roomDestinatario = '';
        if (data.remitente_tipo === 'cliente' && mensajeData.transportista_id) {
            roomDestinatario = `transportista_chats_${mensajeData.transportista_id}`;
            console.log(`📤 Notificando a transportista: ${roomDestinatario}`);
            console.log(`   - Contador no leídos: ${contadorDestinatario}`);
            io.to(roomDestinatario).emit('actualizar-lista-chats', datosActualizacion);
        } 
        else if (data.remitente_tipo === 'transportista' && mensajeData.cliente_id) {
            roomDestinatario = `cliente_chats_${mensajeData.cliente_id}`;
            console.log(`📤 Notificando a cliente: ${roomDestinatario}`);
            console.log(`   - Contador no leídos: ${contadorDestinatario}`);
            io.to(roomDestinatario).emit('actualizar-lista-chats', datosActualizacion);
        }
        else if (data.remitente_tipo === 'empresa' && mensajeData.transportista_id) {
    roomDestinatario = `transportista_chats_${mensajeData.transportista_id}`;
    console.log(`📤 Notificando a transportista (mensaje de empresa): ${roomDestinatario}`);
    console.log(`   - Contador no leídos: ${contadorDestinatario}`);
    io.to(roomDestinatario).emit('actualizar-lista-chats', datosActualizacion);
}
        let roomRemitente = '';
        if (data.remitente_tipo === 'cliente' && mensajeData.cliente_id) {
            roomRemitente = `cliente_chats_${mensajeData.cliente_id}`;
            const datosRemitente = {
                ...datosActualizacion,
                unreadCount: 0, 
                shouldIncrement: false
            };
            console.log(`📤 Actualizando lista del remitente (cliente): ${roomRemitente}`);
            io.to(roomRemitente).emit('actualizar-lista-chats', datosRemitente);
        } 
        else if (data.remitente_tipo === 'transportista' && mensajeData.transportista_id) {
            roomRemitente = `transportista_chats_${mensajeData.transportista_id}`;
            const datosRemitente = {
                ...datosActualizacion,
                unreadCount: 0, 
                shouldIncrement: false
            };
            console.log(`📤 Actualizando lista del remitente (transportista): ${roomRemitente}`);
            io.to(roomRemitente).emit('actualizar-lista-chats', datosRemitente);
        }
        
        if (mensajeData.empresa_id) {
            const [contadorEmpresa] = await pool.query(`
                SELECT COUNT(*) as total_no_leidos 
                FROM mensajes 
                WHERE chat_id = ? 
                AND leido = 0 
                AND remitente_tipo != 'empresa'
            `, [data.chatId]);
            
            const contadorParaEmpresa = contadorEmpresa[0]?.total_no_leidos || 0;
            
            const roomEmpresa = `empresa_chats_${mensajeData.empresa_id}`;
            const datosEmpresa = {
                ...datosActualizacion,
                unreadCount: contadorParaEmpresa,
                shouldIncrement: true
            };
            console.log(`📤 Notificando a empresa: ${roomEmpresa}`);
            console.log(`   - Contador para empresa: ${contadorParaEmpresa}`);
            io.to(roomEmpresa).emit('actualizar-lista-chats', datosEmpresa);
        }
        
        console.log('✅ Lista de chats actualizada para todos los participantes');
        socket.emit('mensaje-confirmado', {
            success: true,
            mensajeId: mensajeId,
            chatId: data.chatId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error en enviar-mensaje-chat:', error);
        socket.emit('error-chat', { 
            mensaje: 'Error al enviar mensaje',
            error: error.message
        });
    }
});
socket.on('debug-chat', (data) => {
    const { chatId } = data;
    const roomName = `chat_${chatId}`;
    const rooms = io.sockets.adapter.rooms;
    
    console.log(`🔍 DEPURACIÓN CHAT ${chatId}:`);
    console.log(`   - Sala: ${roomName}`);
    console.log(`   - ¿Existe?: ${rooms.has(roomName) ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   - Clientes en sala: ${rooms.has(roomName) ? rooms.get(roomName).size : 0}`);
    
    if (rooms.has(roomName)) {
        const socketsEnSala = Array.from(rooms.get(roomName) || []);
        console.log(`   - Sockets en sala:`, socketsEnSala);
        socketsEnSala.forEach(socketId => {
            const socketInfo = io.sockets.sockets.get(socketId);
            if (socketInfo) {
                console.log(`     • Socket ${socketId}:`, {
                    user: socketInfo.user?.id_usuario,
                    tipo: socketInfo.user?.tipo
                });
            }
        });
    }
});

        socket.on('leer-mensajes', (data) => {
            const { chatId, remitente_tipo } = data;
            if (!chatId || !remitente_tipo) return;

            console.log(`📖 Mensajes marcados como leídos en chat ${chatId} por ${remitente_tipo}`);
            
            const roomName = `chat_${chatId}`;
            socket.to(roomName).emit('mensajes-leidos', {
                chatId: chatId,
                leido_por: remitente_tipo,
                timestamp: new Date()
            });
        });

        socket.on('disconnect', (reason) => {
            console.log('🔌 Cliente desconectado:', socket.id, '- Razón:', reason);
            console.log('Salas restantes:', Array.from(socket.rooms));
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io no inicializado');
    }
    return io;
};

module.exports = { setupWebSocket, getIO };