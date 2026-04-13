const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

let _ioInstance = null;

const setIO = (io) => {
    _ioInstance = io;
};

const getIO = () => {
    if (!_ioInstance) {
        try {
            const app = require('../index');
            _ioInstance = app.get('io');
        } catch (error) {
            console.error('❌ No se pudo obtener instancia de io:', error);
        }
    }
    return _ioInstance;
};
router.use(authMiddleware);
router.post('/', async (req, res) => {
  try {
    const { empresa_id, id_cliente, id_pedido, titulo, mensaje, tipo = 'info' } = req.body;
    
    console.log('\n📢📢📢 CREANDO NOTIFICACIÓN 📢📢📢');
    console.log('   - Empresa:', empresa_id);
    console.log('   - Cliente:', id_cliente);
    console.log('   - Pedido:', id_pedido);
    console.log('   - Título:', titulo);
    const [notificacionesExistentes] = await db.execute(
      `SELECT id_notificacion FROM notificaciones 
       WHERE empresa_id = ? AND id_cliente = ? AND id_pedido = ? 
       AND titulo = ? AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
       LIMIT 1`,
      [empresa_id, id_cliente, id_pedido, titulo]
    );
    
    if (notificacionesExistentes.length > 0) {
      console.log('⚠️  Notificación similar ya existe (en los últimos 60 segundos)');
      return res.status(200).json({
        success: true,
        message: 'Notificación similar ya existe',
        duplicada: true
      });
    }
    
    const [result] = await db.execute(
      `INSERT INTO notificaciones (empresa_id, id_cliente, id_pedido, titulo, mensaje, tipo, leida, fecha_creacion) 
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
      [empresa_id, id_cliente, id_pedido, titulo, mensaje, tipo]
    );

    const notificacionId = result.insertId;
    console.log(`✅ Notificación creada en BD - ID: ${notificacionId}`);
    
    const notificacionSocket = {
      id_notificacion: notificacionId,
      notificationId: notificacionId,
      empresa_id: parseInt(empresa_id),
      id_cliente: parseInt(id_cliente),
      id_pedido: parseInt(id_pedido),
      titulo: titulo,
      mensaje: mensaje,
      tipo: tipo,
      leida: false,
      fecha_creacion: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };
    
    try {
      const io = getIO();
      if (io) {
        const roomName = `cliente_${id_cliente}`;
        const rooms = io.sockets.adapter.rooms;
        const existeSala = rooms.has(roomName);
        if (existeSala) {
          io.to(roomName).emit('nueva_notificacion', notificacionSocket);
          console.log(`📢 Notificación enviada por socket a sala: ${roomName}`);
        }
      }
    } catch (socketError) {
      console.error('⚠️ Error enviando notificación por socket:', socketError);
    }

    res.status(201).json({
      success: true,
      id_notificacion: notificacionId,
      message: 'Notificación creada exitosamente',
      notificacion: notificacionSocket
    });

  } catch (error) {
    console.error('\n❌❌❌ ERROR CREANDO NOTIFICACIÓN:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear notificación: ' + error.message
    });
  }
});
router.post('/enviar-tracking', async (req, res) => {
  try {
    const { pedidoId, titulo, mensaje, tipo = 'info', etapa } = req.body;
    
    console.log('\n🚚 ENVIANDO NOTIFICACIÓN DE TRACKING');
    console.log('   - Pedido ID:', pedidoId);
    console.log('   - Título:', titulo);
    console.log('   - Etapa:', etapa);
    const [pedidoInfo] = await db.execute(
      `SELECT p.id_cliente, p.empresa_id 
       FROM pedidos p 
       WHERE p.id_pedido = ?`,
      [pedidoId]
    );
    
    if (pedidoInfo.length === 0) {
      console.log('❌ Pedido no encontrado:', pedidoId);
      return res.status(404).json({ 
        success: false, 
        message: 'Pedido no encontrado' 
      });
    }
    
    const clienteId = pedidoInfo[0].id_cliente;
    const empresaId = pedidoInfo[0].empresa_id;
    
    console.log('   - Cliente encontrado:', clienteId);
    console.log('   - Empresa:', empresaId);
    const [result] = await db.execute(
      `INSERT INTO notificaciones (empresa_id, id_cliente, id_pedido, titulo, mensaje, tipo, leida, fecha_creacion) 
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
      [empresaId, clienteId, pedidoId, titulo, mensaje, tipo]
    );
    
    const notificacionId = result.insertId;
    console.log(`✅ Notificación tracking creada - ID: ${notificacionId}`);
    const notificacionData = {
      id_notificacion: notificacionId,
      notificationId: notificacionId,
      empresa_id: empresaId,
      id_cliente: clienteId,
      id_pedido: pedidoId,
      titulo: titulo,
      mensaje: mensaje,
      tipo: tipo || 'info',
      leida: false,
      fecha_creacion: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      etapa: etapa || 'tracking'
    };
    const io = getIO();
    if (io) {
      const roomName = `cliente_${clienteId}`;
      const roomEnvio = `envio_tracking_${pedidoId}`;
      const rooms = io.sockets.adapter.rooms;
      const existeSalaCliente = rooms.has(roomName);
      const existeSalaEnvio = rooms.has(roomEnvio);
      
      console.log('\n🔍 ESTADO DE SALAS:');
      console.log(`   - Sala cliente ${roomName}: ${existeSalaCliente ? '✅ EXISTE' : '❌ NO EXISTE'}`);
      console.log(`   - Sala envío ${roomEnvio}: ${existeSalaEnvio ? '✅ EXISTE' : '❌ NO EXISTE'}`);
      if (existeSalaCliente) {
        io.to(roomName).emit('nueva_notificacion', notificacionData);
        console.log(`📢 Notificación enviada a sala cliente: ${roomName}`);
      }
      if (existeSalaEnvio) {
        io.to(roomEnvio).emit('notificacion_tracking', notificacionData);
        console.log(`📢 Notificación enviada a sala tracking: ${roomEnvio}`);
      }
      
      if (!existeSalaCliente && !existeSalaEnvio) {
        io.emit('nueva_notificacion_global', {
          clienteId: clienteId,
          pedidoId: pedidoId,
          notificacion: notificacionData
        });
        console.log('📢 Notificación enviada globalmente');
      }
    } else {
      console.warn('⚠️  Socket.IO no disponible');
    }
    
    res.json({ 
      success: true, 
      message: 'Notificación de tracking enviada',
      notificacionId: notificacionId,
      notificacion: notificacionData
    });
    
  } catch (error) {
    console.error('❌ Error enviando notificación tracking:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor: ' + error.message 
    });
  }
});
router.post('/estado-pedido', async (req, res) => {
  try {
    const { pedidoId, estado, mensajePersonalizado } = req.body;
    
    console.log('\n🔄 ENVIANDO NOTIFICACIÓN DE ESTADO DE PEDIDO');
    console.log('   - Pedido:', pedidoId);
    console.log('   - Estado:', estado);
    const mensajesEstado = {
      'PENDIENTE': {
        titulo: '📦 Pedido Recibido',
        mensaje: 'Tu pedido ha sido recibido y está siendo procesado.'
      },
      'ACEPTADO': {
        titulo: '✅ Pedido Aceptado',
        mensaje: '¡Tu pedido ha sido aceptado! Estamos preparándolo para el envío.'
      },
      'EN CAMINO': {
        titulo: '🚚 Pedido en Camino',
        mensaje: '¡Excelente noticia! Tu pedido está en camino hacia su destino.'
      },
      'ENTREGADO': {
        titulo: '🎉 Pedido Entregado',
        mensaje: '¡Perfecto! Tu pedido ha sido entregado exitosamente.'
      },
      'RECHAZADO': {
        titulo: '❌ Pedido Rechazado',
        mensaje: 'Lo sentimos, tu pedido ha sido rechazado. Contacta al soporte para más información.'
      }
    };
    
    const mensajeEstado = mensajesEstado[estado] || {
      titulo: `📦 Actualización de Pedido`,
      mensaje: `El estado de tu pedido ha cambiado a: ${estado}`
    };
    const titulo = mensajePersonalizado?.titulo || mensajeEstado.titulo;
    const mensaje = mensajePersonalizado?.mensaje || mensajeEstado.mensaje;
    const [pedidoInfo] = await db.execute(
      `SELECT p.id_cliente, p.empresa_id 
       FROM pedidos p 
       WHERE p.id_pedido = ?`,
      [pedidoId]
    );
    
    if (pedidoInfo.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Pedido no encontrado' 
      });
    }
    
    const clienteId = pedidoInfo[0].id_cliente;
    const empresaId = pedidoInfo[0].empresa_id;
    const response = await router.handle(req, res, () => {});
    const [result] = await db.execute(
      `INSERT INTO notificaciones (empresa_id, id_cliente, id_pedido, titulo, mensaje, tipo, leida, fecha_creacion) 
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
      [empresaId, clienteId, pedidoId, titulo, mensaje, 'info']
    );
    
    const notificacionId = result.insertId;
    const io = getIO();
    if (io) {
      const notificacionData = {
        id_notificacion: notificacionId,
        notificationId: notificacionId,
        empresa_id: empresaId,
        id_cliente: clienteId,
        id_pedido: pedidoId,
        titulo: titulo,
        mensaje: mensaje,
        tipo: 'info',
        leida: false,
        fecha_creacion: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        estado: estado
      };
      io.to(`cliente_${clienteId}`).emit('nueva_notificacion', notificacionData);
      console.log(`📢 Notificación de estado enviada a cliente ${clienteId}`);
    }
    
    res.json({ 
      success: true, 
      message: 'Notificación de estado enviada',
      estado: estado,
      notificacionId: notificacionId
    });
    
  } catch (error) {
    console.error('❌ Error enviando notificación de estado:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { empresa_id } = req.query;

    console.log('\n📡 SOLICITANDO NOTIFICACIONES PARA CLIENTE');
    console.log('   - Cliente ID:', clienteId);
    console.log('   - Empresa ID:', empresa_id);

    if (!clienteId || !empresa_id) {
      return res.status(400).json({
        success: false,
        error: 'ID de cliente y empresa requeridos'
      });
    }
    
    const [notificaciones] = await db.execute(
      `SELECT 
         n.*, 
         p.descripcion,
         DATE_FORMAT(n.fecha_creacion, '%Y-%m-%d %H:%i:%s') as fecha_formateada
       FROM notificaciones n
       LEFT JOIN pedidos p ON n.id_pedido = p.id_pedido
       WHERE n.id_cliente = ? AND n.empresa_id = ?
       ORDER BY n.fecha_creacion DESC
       LIMIT 50`,
      [clienteId, empresa_id]
    );

    console.log('📦 Notificaciones encontradas:', notificaciones.length);

    res.json({
      success: true,
      notificaciones: notificaciones,
      total: notificaciones.length,
      no_leidas: notificaciones.filter(n => n.leida === 0).length
    });

  } catch (error) {
    console.error('❌ Error obteniendo notificaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener notificaciones: ' + error.message
    });
  }
});
router.put('/:notificacionId/leida', async (req, res) => {
  try {
    const { notificacionId } = req.params;
    const { id_cliente, empresa_id } = req.body; 

    console.log('\n👁️  MARCANDO NOTIFICACIÓN COMO LEÍDA');
    console.log('   - Notificación ID:', notificacionId);
    console.log('   - Cliente ID del body:', id_cliente);
    console.log('   - Empresa ID del body:', empresa_id);

    if (!notificacionId || isNaN(notificacionId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de notificación inválido'
      });
    }
    const clienteId = id_cliente || req.user?.id_cliente;
    const empresaId = empresa_id || req.user?.empresa_id;

    console.log('   - Cliente ID final:', clienteId);
    console.log('   - Empresa ID final:', empresaId);
    if (!clienteId || !empresaId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere clienteId y empresaId para marcar notificación como leída'
      });
    }

    const [result] = await db.execute(
      `UPDATE notificaciones SET leida = 1 
       WHERE id_notificacion = ? 
       AND id_cliente = ? 
       AND empresa_id = ?`, 
      [notificacionId, clienteId, empresaId]
    );

    if (result.affectedRows === 0) {
      console.log('⚠️  Notificación no encontrada o no pertenece a este cliente/empresa:', notificacionId);
      return res.status(200).json({
        success: true,
        message: 'Notificación no encontrada o ya estaba leída',
        notificacionId: notificacionId,
        affectedRows: 0
      });
    }

    console.log('✅ Notificación marcada como leída:', result.affectedRows);

    try {
      const io = getIO();
      if (io) {
        const roomName = `cliente_${clienteId}`;
        io.to(roomName).emit('actualizar_contador_notificaciones', {
          decremento: 1,
          notificacionId: notificacionId,
          timestamp: new Date().toISOString()
        });
        console.log(`📢 Contador actualizado para cliente ${clienteId}`);
      }
    } catch (socketError) {
      console.error('⚠️ Error emitiendo actualización de contador:', socketError);
    }

    res.json({
      success: true,
      message: 'Notificación marcada como leída',
      notificacionId: notificacionId,
      affectedRows: result.affectedRows
    });

  } catch (error) {
    console.error('❌ Error marcando notificación como leída:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar notificación: ' + error.message
    });
  }
});
router.get('/cliente/:clienteId/contador', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { empresa_id } = req.query;

    console.log('\n🔢 CONTANDO NOTIFICACIONES NO LEÍDAS');
    console.log('   - Cliente:', clienteId);
    console.log('   - Empresa:', empresa_id);

    if (!clienteId || !empresa_id) {
      return res.status(400).json({
        success: false,
        error: 'ID de cliente y empresa requeridos'
      });
    }
    
    const [result] = await db.execute(
      `SELECT COUNT(*) as count
       FROM notificaciones 
       WHERE id_cliente = ? AND empresa_id = ? AND leida = 0`,
      [clienteId, empresa_id]
    );

    const count = result[0]?.count || 0;
    console.log(`   - No leídas: ${count}`);

    res.json({
      success: true,
      count: count,
      clienteId: clienteId,
      empresa_id: empresa_id
    });

  } catch (error) {
    console.error('❌ Error contando notificaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error al contar notificaciones: ' + error.message
    });
  }
});

router.delete('/:notificacionId', async (req, res) => {
  try {
    const { notificacionId } = req.params;

    console.log('\n🗑️  ELIMINANDO NOTIFICACIÓN');
    console.log('   - ID:', notificacionId);

    if (!notificacionId || isNaN(notificacionId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de notificación inválido'
      });
    }
    
    const [result] = await db.execute(
      `DELETE FROM notificaciones 
       WHERE id_notificacion = ?`,
      [notificacionId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notificación no encontrada'
      });
    }

    console.log('✅ Notificación eliminada');

    res.json({
      success: true,
      message: 'Notificación eliminada correctamente',
      notificacionId: notificacionId
    });

  } catch (error) {
    console.error('❌ Error eliminando notificación:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar notificación: ' + error.message
    });
  }
});
router.post('/debug/prueba', async (req, res) => {
  try {
    const { clienteId, empresaId, mensaje } = req.body;
    
    console.log('\n🔧🔧🔧 PRUEBA DE NOTIFICACIONES 🔧🔧🔧');
    console.log('   - Cliente ID:', clienteId);
    console.log('   - Empresa ID:', empresaId);
    console.log('   - Mensaje:', mensaje || 'Mensaje de prueba');
    const [result] = await db.execute(
      `INSERT INTO notificaciones (empresa_id, id_cliente, id_pedido, titulo, mensaje, tipo, leida, fecha_creacion) 
       VALUES (?, ?, 999, '🔔 Notificación de Prueba', ?, 'debug', 0, NOW())`,
      [empresaId, clienteId, mensaje || 'Esta es una notificación de prueba del sistema']
    );
    
    const notificacionId = result.insertId;
    const io = getIO();
    if (io) {
      const roomName = `cliente_${clienteId}`;
      const rooms = io.sockets.adapter.rooms;
      
      console.log('\n🔍 VERIFICANDO CONEXIÓN SOCKET:');
      console.log(`   - Sala buscada: ${roomName}`);
      console.log(`   - ¿Sala existe?: ${rooms.has(roomName) ? '✅ SÍ' : '❌ NO'}`);
      console.log(`   - Clientes en sala: ${rooms.has(roomName) ? rooms.get(roomName).size : 0}`);
      
      const notificacionPrueba = {
        id_notificacion: notificacionId,
        notificationId: notificacionId,
        empresa_id: parseInt(empresaId),
        id_cliente: parseInt(clienteId),
        id_pedido: 999,
        titulo: '🔔 Notificación de Prueba',
        mensaje: mensaje || 'Esta es una notificación de prueba del sistema',
        tipo: 'debug',
        leida: false,
        fecha_creacion: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        debug: true
      };
      io.to(roomName).emit('nueva_notificacion', notificacionPrueba);
      io.emit('nueva_notificacion_global', {
        clienteId: clienteId,
        notificacion: notificacionPrueba
      });
      
      console.log('\n📢 EVENTOS EMITIDOS:');
      console.log('   - "nueva_notificacion" a sala:', roomName);
      console.log('   - "nueva_notificacion_global" globalmente');
    } else {
      console.warn('⚠️  Socket.IO no disponible');
    }
    
    res.json({
      success: true,
      message: 'Notificación de prueba enviada',
      notificacionId: notificacionId,
      debug: {
        clienteId: clienteId,
        empresaId: empresaId,
        socketDisponible: !!io,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error en prueba de notificaciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error en prueba: ' + error.message
    });
  }
});

module.exports = {
  router: router,
  setIO: setIO
};