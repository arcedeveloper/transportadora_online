const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const pool = require('../models/database');
router.get('/empresa/:empresaId/transportistas-en-viaje', authMiddleware, async (req, res) => {
    try {
        const { empresaId } = req.params;

        const [transportistas] = await pool.query(`
            SELECT 
                t.id_transportista,
                t.nombre,
                t.telefono,
                t.vehiculo,
                t.estado,
                e.id_envio,
                e.estado as estado_envio,
                p.id_pedido,
                p.direccion_destino,
                p.direccion_origen,
                p.latitud_origen,
                p.longitud_origen,
                p.latitud_destino,
                p.longitud_destino,
                p.descripcion,
                -- Última ubicación REAL del transportista
                (
                    SELECT u2.latitud 
                    FROM ubicaciones u2 
                    WHERE u2.id_transportista = t.id_transportista 
                    AND u2.id_pedido = e.id_pedido
                    ORDER BY u2.fecha DESC 
                    LIMIT 1
                ) as ultima_latitud,
                (
                    SELECT u2.longitud 
                    FROM ubicaciones u2 
                    WHERE u2.id_transportista = t.id_transportista 
                    AND u2.id_pedido = e.id_pedido
                    ORDER BY u2.fecha DESC 
                    LIMIT 1
                ) as ultima_longitud,
                (
                    SELECT u2.fecha 
                    FROM ubicaciones u2 
                    WHERE u2.id_transportista = t.id_transportista 
                    AND u2.id_pedido = e.id_pedido
                    ORDER BY u2.fecha DESC 
                    LIMIT 1
                ) as ultima_fecha
            FROM envios e
            INNER JOIN transportistas t ON e.id_transportista = t.id_transportista
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE p.empresa_id = ?
            AND e.estado = 'EN CAMINO'
            ORDER BY ultima_fecha DESC
        `, [empresaId]);

        const resultado = transportistas.map(t => {
            let latitud, longitud;
            
            if (t.ultima_latitud && t.ultima_longitud) {
                latitud = parseFloat(t.ultima_latitud);
                longitud = parseFloat(t.ultima_longitud);
            } else {
                latitud = t.latitud_origen ? parseFloat(t.latitud_origen) : -25.339260;
                longitud = t.longitud_origen ? parseFloat(t.longitud_origen) : -57.508790;
            }

            return {
                transportista: {
                    id: t.id_transportista,
                    nombre: t.nombre,
                    telefono: t.telefono,
                    vehiculo: t.vehiculo,
                    estado: t.estado
                },
                ubicacion: {
                    latitud: latitud,
                    longitud: longitud,
                    fecha: t.ultima_fecha || new Date()
                },
                pedido_actual: {
                    id: t.id_envio,
                    id_pedido: t.id_pedido,
                    destino: t.direccion_destino,
                    origen: t.direccion_origen,
                    descripcion: t.descripcion,
                    estado: t.estado_envio
                }
            };
        });

        res.json({
            success: true,
            transportistas: resultado,
            total: resultado.length
        });

    } catch (error) {
        console.error('Error obteniendo transportistas en viaje:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo transportistas en viaje'
        });
    }
});
router.get('/empresa/:empresaId/verificar-envios', authMiddleware, async (req, res) => {
    try {
        const { empresaId } = req.params;

        console.log('🔍 Verificando envíos para empresa:', empresaId);
        const [todosEnvios] = await pool.query(`
            SELECT 
                e.id_envio,
                e.estado,
                t.id_transportista,
                t.nombre as transportista_nombre,
                t.estado as estado_transportista,
                p.id_pedido,
                p.descripcion,
                p.direccion_origen,
                p.direccion_destino,
                (SELECT COUNT(*) FROM ubicaciones u WHERE u.id_transportista = t.id_transportista AND u.id_pedido = p.id_pedido) as total_ubicaciones
            FROM envios e
            INNER JOIN transportistas t ON e.id_transportista = t.id_transportista
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE p.empresa_id = ?
            ORDER BY e.estado, e.id_envio
        `, [empresaId]);

        console.log('📦 Todos los envíos encontrados:', todosEnvios);
        const enviosEnCamino = todosEnvios.filter(e => e.estado === 'EN CAMINO');
        
        console.log('🚚 Envíos EN CAMINO:', enviosEnCamino);

        res.json({
            success: true,
            todosEnvios: todosEnvios,
            enviosEnCamino: enviosEnCamino,
            totalEnCamino: enviosEnCamino.length,
            mensaje: `Se encontraron ${enviosEnCamino.length} envíos EN CAMINO de ${todosEnvios.length} totales`
        });

    } catch (error) {
        console.error('❌ Error verificando envíos:', error);
        res.status(500).json({
            success: false,
            message: 'Error verificando envíos',
            error: error.message
        });
    }
});

router.get('/empresa/:empresaId/diagnostico', authMiddleware, async (req, res) => {
    try {
        const { empresaId } = req.params;
        
        console.log('🔧 Ejecutando diagnóstico completo para empresa:', empresaId);

        const [empresa] = await pool.query('SELECT * FROM empresas WHERE empresa_id = ?', [empresaId]);
        
        const [enviosEnCamino] = await pool.query(`
            SELECT e.*, t.nombre, p.direccion_origen, p.direccion_destino 
            FROM envios e
            INNER JOIN transportistas t ON e.id_transportista = t.id_transportista
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE p.empresa_id = ? AND e.estado = 'EN CAMINO'
        `, [empresaId]);

        const [ubicaciones] = await pool.query(`
            SELECT u.*, t.nombre, p.direccion_destino, e.estado as estado_envio
            FROM ubicaciones u
            INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
            INNER JOIN envios e ON u.id_pedido = e.id_pedido
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE p.empresa_id = ?
            ORDER BY u.fecha DESC
            LIMIT 20
        `, [empresaId]);

        const [transportistas] = await pool.query(`
            SELECT * FROM transportistas WHERE empresa_id = ?
        `, [empresaId]);

        const [pedidos] = await pool.query(`
            SELECT * FROM pedidos WHERE empresa_id = ? ORDER BY id_pedido DESC LIMIT 10
        `, [empresaId]);

        res.json({
            success: true,
            diagnostico: {
                empresa: empresa.length > 0 ? {
                    encontrada: true,
                    nombre: empresa[0].nombre_empresa,
                    id: empresa[0].empresa_id
                } : { encontrada: false },
                
                resumen: {
                    totalTransportistas: transportistas.length,
                    totalPedidos: pedidos.length,
                    totalEnviosEnCamino: enviosEnCamino.length,
                    totalUbicacionesRegistradas: ubicaciones.length
                },
                
                detalles: {
                    transportistas: transportistas,
                    enviosEnCamino: enviosEnCamino,
                    ultimasUbicaciones: ubicaciones,
                    pedidosRecientes: pedidos
                },
                
                timestamp: new Date().toISOString(),
                servidor: 'OK'
            }
        });

    } catch (error) {
        console.error('❌ Error en diagnóstico:', error);
        res.status(500).json({
            success: false,
            message: 'Error en diagnóstico',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

router.get('/envio/:envioId/ubicaciones', authMiddleware, async (req, res) => {
    try {
        const { envioId } = req.params;
        
        console.log(`📍 Obteniendo historial de ubicaciones para envío: ${envioId}`);

        const [ubicaciones] = await pool.query(`
            SELECT 
                u.*,
                t.nombre as transportista_nombre,
                t.vehiculo,
                p.direccion_destino,
                p.direccion_origen
            FROM ubicaciones u
            INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
            INNER JOIN envios e ON u.id_pedido = e.id_pedido
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE e.id_envio = ?
            ORDER BY u.fecha DESC
            LIMIT 50
        `, [envioId]);

        console.log(`✅ Historial de ubicaciones obtenido: ${ubicaciones.length} registros`);

        res.json({
            success: true,
            ubicaciones: ubicaciones,
            total: ubicaciones.length,
            mensaje: `Se encontraron ${ubicaciones.length} ubicaciones para el envío ${envioId}`
        });

    } catch (error) {
        console.error('❌ Error obteniendo historial de ubicaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo historial de ubicaciones',
            error: error.message
        });
    }
});

router.get('/transportista/:transportistaId/ubicacion-actual', authMiddleware, async (req, res) => {
    try {
        const { transportistaId } = req.params;
        
        console.log(`📍 Obteniendo ubicación actual para transportista: ${transportistaId}`);

        const [ubicacion] = await pool.query(`
            SELECT 
                u.*,
                t.nombre,
                t.vehiculo,
                t.telefono,
                e.id_envio,
                e.estado as estado_envio,
                p.direccion_destino,
                p.direccion_origen
            FROM ubicaciones u
            INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
            INNER JOIN envios e ON u.id_pedido = e.id_pedido
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE u.id_transportista = ?
            ORDER BY u.fecha DESC
            LIMIT 1
        `, [transportistaId]);

        if (ubicacion.length === 0) {
            return res.json({
                success: true,
                ubicacion: null,
                mensaje: 'No se encontró ubicación reciente para este transportista'
            });
        }

        console.log(`✅ Ubicación actual obtenida: ${ubicacion[0].latitud}, ${ubicacion[0].longitud}`);

        res.json({
            success: true,
            ubicacion: {
                transportista: {
                    id: transportistaId,
                    nombre: ubicacion[0].nombre,
                    vehiculo: ubicacion[0].vehiculo,
                    telefono: ubicacion[0].telefono
                },
                ubicacion: {
                    latitud: parseFloat(ubicacion[0].latitud),
                    longitud: parseFloat(ubicacion[0].longitud),
                    fecha: ubicacion[0].fecha
                },
                pedido: {
                    id_envio: ubicacion[0].id_envio,
                    estado: ubicacion[0].estado_envio,
                    destino: ubicacion[0].direccion_destino,
                    origen: ubicacion[0].direccion_origen
                }
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo ubicación actual:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo ubicación actual',
            error: error.message
        });
    }
});
router.get('/envio/:envioId/detalles-completos', authMiddleware, async (req, res) => {
  try {
    const { envioId } = req.params;
    const userRole = req.user.id_rol; 
    
    console.log(`👤 Usuario rol: ${userRole} solicitando detalles para envío: ${envioId}`);

    const query = `
      SELECT 
        p.id_pedido,
        p.direccion_origen,
        p.direccion_destino,
        p.latitud_origen,
        p.longitud_origen,
        p.latitud_destino,
        p.longitud_destino,
        p.fecha_envio,
        p.tipo_carga,
        p.descripcion,
        e.estado,
        t.nombre as transportista_nombre,
        t.vehiculo,
        t.telefono as transportista_telefono
      FROM pedidos p
      LEFT JOIN envios e ON p.id_pedido = e.id_pedido
      LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista
      WHERE p.id_pedido = ?
    `;
    
    const [result] = await pool.query(query, [envioId]);
    
    if (result.length > 0) {
      const envio = result[0];
      if (userRole === 3 && envio.estado !== 'EN CAMINO') {
        console.log(`👤 Cliente - Tracking NO disponible. Estado actual: ${envio.estado}`);
        
        return res.json({
          success: true,
          envio: {
            ...envio,
            tracking_disponible: false,
            mensaje_cliente: getMensajeParaCliente(envio.estado)
          }
        });
      }
      
      console.log(`✅ Tracking DISPONIBLE para rol ${userRole}. Estado: ${envio.estado}`);
      
      res.json({
        success: true,
        envio: {
          ...envio,
          tracking_disponible: true
        }
      });
      
    } else {
      res.status(404).json({
        success: false,
        message: 'Envío no encontrado'
      });
    }
  } catch (error) {
    console.error('❌ Error obteniendo detalles envío:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function getMensajeParaCliente(estado) {
  switch (estado) {
    case 'PENDIENTE':
      return '⏳ Estamos buscando un transportista para tu pedido. Te notificaremos cuando sea aceptado.';
    
    case 'ACEPTADO':
      return '🚗 El transportista está yendo al punto de retiro. Podrás seguir el recorrido en vivo cuando inicie el viaje hacia tu destino.';
    
    case 'EN CAMINO':
      return '✅ El tracking está disponible'; 
    
    case 'ENTREGADO':
      return '🎉 ¡Tu pedido ha sido entregado! Gracias por confiar en nosotros.';
    
    default:
      return '📦 Tu pedido está siendo procesado. El seguimiento estará disponible pronto.';
  }
}
router.get('/envio/:envioId/ubicacion-actual', authMiddleware, async (req, res) => {
  try {
    const { envioId } = req.params;
    
    console.log(`📍 Obteniendo ubicación actual para envío: ${envioId}`);

    const [ubicacion] = await pool.query(`
      SELECT 
        u.latitud,
        u.longitud,
        u.fecha,
        t.nombre as transportista_nombre,
        t.vehiculo,
        t.id_transportista
      FROM ubicaciones u
      INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
      INNER JOIN envios e ON u.id_pedido = e.id_pedido
      WHERE e.id_envio = ?
      ORDER BY u.fecha DESC
      LIMIT 1
    `, [envioId]);

    if (ubicacion.length === 0) {
      console.log(`⚠️ No hay ubicación para envío: ${envioId}`);
      return res.json({
        success: true,
        ubicacion: null,
        message: 'No se encontró ubicación reciente para este envío'
      });
    }

    console.log(`✅ Ubicación obtenida para envío ${envioId}: ${ubicacion[0].latitud}, ${ubicacion[0].longitud}`);

    res.json({
      success: true,
      ubicacion: {
        latitud: parseFloat(ubicacion[0].latitud),
        longitud: parseFloat(ubicacion[0].longitud),
        fecha: ubicacion[0].fecha,
        transportista_nombre: ubicacion[0].transportista_nombre,
        vehiculo: ubicacion[0].vehiculo,
        transportista_id: ubicacion[0].id_transportista
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo ubicación por envío:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo ubicación actual',
      error: error.message
    });
  }
});

module.exports = router;