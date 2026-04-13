const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const pool = require('../models/database');

router.post('/actualizar', async (req, res) => {
  try {
    const { id_transportista, latitud, longitud, id_pedido, empresa_id } = req.body;
    
    console.log('📍📍📍 RECIBIENDO UBICACIÓN DEL TRANSPORTISTA:', {
      id_transportista,
      latitud,
      longitud, 
      id_pedido,
      empresa_id
    });

    if (!id_transportista || !latitud || !longitud || !id_pedido || !empresa_id) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios',
        campos_recibidos: { id_transportista, latitud, longitud, id_pedido, empresa_id }
      });
    }

    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);
    
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Coordenadas inválidas',
        latitud_recibida: latitud,
        longitud_recibida: longitud
      });
    }
    const [transportistaCheck] = await pool.query(
      'SELECT id_transportista, nombre FROM transportistas WHERE id_transportista = ? AND empresa_id = ?',
      [id_transportista, empresa_id]
    );

    if (transportistaCheck.length === 0) {
      console.log('❌ Transportista no encontrado:', { id_transportista, empresa_id });
      return res.status(404).json({
        success: false,
        message: 'Transportista no encontrado o no pertenece a esta empresa'
      });
    }

    const transportistaNombre = transportistaCheck[0].nombre;
    const [envioCheck] = await pool.query(
      `SELECT e.id_envio, e.estado, p.direccion_destino 
       FROM envios e 
       INNER JOIN pedidos p ON e.id_pedido = p.id_pedido 
       WHERE e.id_envio = ? AND p.empresa_id = ?`,
      [id_pedido, empresa_id]
    );

    if (envioCheck.length === 0) {
      console.log('❌ Envío no encontrado:', { id_pedido, empresa_id });
      return res.status(404).json({
        success: false,
        message: 'Envío no encontrado'
      });
    }

    const estadoEnvio = envioCheck[0].estado;
    const destino = envioCheck[0].direccion_destino;

    if (estadoEnvio !== 'EN CAMINO') {
      console.log('⚠️ Envío no está EN CAMINO:', estadoEnvio);
    }
    const [result] = await pool.query(
      `INSERT INTO ubicaciones (id_transportista, id_pedido, latitud, longitud, fecha, empresa_id) 
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [id_transportista, id_pedido, lat, lng, empresa_id]
    );

    console.log(' Ubicación guardada en BD correctamente - ID:', result.insertId);
    console.log(`   Transportista: ${transportistaNombre} (${id_transportista})`);
    console.log(`   Envío: ${id_pedido} - Estado: ${estadoEnvio}`);
    console.log(`   Destino: ${destino}`);
    console.log(`   Coordenadas: ${lat}, ${lng}`);
    try {
      const io = req.app.get('socketio');
      if (io) {
        io.to(`tracking_empresa_${empresa_id}`).emit('ubicacion-actualizada', {
          transportistaId: id_transportista,
          transportistaNombre: transportistaNombre,
          latitud: lat,
          longitud: lng,
          envioId: id_pedido,
          destino: destino,
          estadoEnvio: estadoEnvio,
          timestamp: new Date(),
          tipo: 'SIMULADA'
        });
        console.log(`📡 Notificación WebSocket enviada a empresa ${empresa_id}`);
        const sockets = await io.fetchSockets();
        const salasEmpresa = sockets.filter(s => 
          s.rooms.has(`tracking_empresa_${empresa_id}`)
        );
        console.log(`👥 Empresa ${empresa_id} tiene ${salasEmpresa.length} sockets conectados`);
      } else {
        console.log('⚠️ WebSocket no disponible para notificar');
      }
    } catch (wsError) {
      console.error('❌ Error enviando WebSocket:', wsError);
    }

    res.json({
      success: true,
      message: 'Ubicación actualizada correctamente',
      data: {
        ubicacion_id: result.insertId,
        transportista: transportistaNombre,
        envio: id_pedido,
        coordenadas: { lat, lng },
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('❌❌❌ Error actualizando ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al actualizar ubicación',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.get('/historial/:envioId', authMiddleware, async (req, res) => {
  try {
    const { envioId } = req.params;
    const empresaId = req.user.empresa_id;

    console.log(`📜 Obteniendo historial de ubicaciones para envío: ${envioId}`);

    const [ubicaciones] = await pool.query(`
      SELECT 
        u.id,
        u.latitud,
        u.longitud,
        u.fecha,
        t.nombre as transportista_nombre,
        t.vehiculo,
        p.direccion_destino,
        p.direccion_origen
      FROM ubicaciones u
      INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
      INNER JOIN envios e ON u.id_pedido = e.id_envio
      INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
      WHERE e.id_envio = ? AND p.empresa_id = ?
      ORDER BY u.fecha ASC
    `, [envioId, empresaId]);

    console.log(`✅ Historial obtenido: ${ubicaciones.length} ubicaciones`);

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

router.get('/ultima/:transportistaId', authMiddleware, async (req, res) => {
  try {
    const { transportistaId } = req.params;
    const empresaId = req.user.empresa_id;

    console.log(`📍 Obteniendo última ubicación para transportista: ${transportistaId}`);

    const [ubicacion] = await pool.query(`
      SELECT 
        u.*,
        t.nombre as transportista_nombre,
        t.vehiculo,
        e.id_envio,
        p.direccion_destino,
        p.direccion_origen
      FROM ubicaciones u
      INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
      INNER JOIN envios e ON u.id_pedido = e.id_envio
      INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
      WHERE u.id_transportista = ? AND p.empresa_id = ?
      ORDER BY u.fecha DESC
      LIMIT 1
    `, [transportistaId, empresaId]);

    if (ubicacion.length === 0) {
      return res.json({
        success: true,
        ubicacion: null,
        mensaje: 'No se encontró ubicación reciente para este transportista'
      });
    }

    console.log(`✅ Última ubicación obtenida: ${ubicacion[0].latitud}, ${ubicacion[0].longitud}`);

    res.json({
      success: true,
      ubicacion: {
        id: ubicacion[0].id,
        transportista: {
          id: transportistaId,
          nombre: ubicacion[0].transportista_nombre,
          vehiculo: ubicacion[0].vehiculo
        },
        ubicacion: {
          latitud: parseFloat(ubicacion[0].latitud),
          longitud: parseFloat(ubicacion[0].longitud),
          fecha: ubicacion[0].fecha
        },
        pedido: {
          id_envio: ubicacion[0].id_envio,
          destino: ubicacion[0].direccion_destino,
          origen: ubicacion[0].direccion_origen
        }
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo última ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo última ubicación',
      error: error.message
    });
  }
});

router.get('/diagnostico/:empresaId', authMiddleware, async (req, res) => {
  try {
    const { empresaId } = req.params;

    console.log(`🔧 Diagnóstico de ubicaciones para empresa: ${empresaId}`);

    const [totalUbicaciones] = await pool.query(
      'SELECT COUNT(*) as total FROM ubicaciones WHERE empresa_id = ?',
      [empresaId]
    );

    const [ubicacionesRecientes] = await pool.query(
      `SELECT u.*, t.nombre as transportista_nombre 
       FROM ubicaciones u
       INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
       WHERE u.empresa_id = ?
       ORDER BY u.fecha DESC
       LIMIT 10`,
      [empresaId]
    );

    const [transportistasConUbicaciones] = await pool.query(
      `SELECT DISTINCT t.id_transportista, t.nombre, COUNT(u.id) as total_ubicaciones
       FROM transportistas t
       LEFT JOIN ubicaciones u ON t.id_transportista = u.id_transportista
       WHERE t.empresa_id = ?
       GROUP BY t.id_transportista, t.nombre
       ORDER BY total_ubicaciones DESC`,
      [empresaId]
    );

    res.json({
      success: true,
      diagnostico: {
        resumen: {
          totalUbicaciones: totalUbicaciones[0].total,
          totalTransportistas: transportistasConUbicaciones.length,
          ubicacionesRecientes: ubicacionesRecientes.length
        },
        detalles: {
          ubicacionesRecientes: ubicacionesRecientes,
          transportistas: transportistasConUbicaciones
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error en diagnóstico de ubicaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error en diagnóstico de ubicaciones',
      error: error.message
    });
  }
});

module.exports = router;