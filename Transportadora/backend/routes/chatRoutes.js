const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
router.get('/:chatId/mensajes', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    console.log(`Obteniendo mensajes para chat: ${chatId}`);
    
    const [chatCheck] = await db.execute(
      'SELECT empresa_id FROM chats WHERE id = ?',
      [chatId]
    );
    
    if (chatCheck.length === 0 || chatCheck[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para acceder a este chat'
      });
    }
    
    const [mensajes] = await db.execute(
      `SELECT 
        id,
        mensaje,
        remitente_tipo as remitente,
        enviado_en,
        leido
      FROM mensajes 
      WHERE chat_id = ? 
      ORDER BY enviado_en ASC`,
      [chatId]
    );
    
    console.log(`✅ ${mensajes.length} mensajes cargados desde BD para chat ${chatId}`);
    
    res.json({
      success: true,
      mensajes: mensajes,
      total: mensajes.length
    });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al obtener mensajes' 
    });
  }
});

router.get('/transportista/:transportistaId/chat', authMiddleware, async (req, res) => {
  try {
    const { transportistaId } = req.params;
    
    console.log(`Buscando chat para transportista: ${transportistaId}`);
    
    const [chats] = await db.execute(
      `SELECT 
        c.id as chatId,
        e.nombre_empresa,
        e.empresa_id
      FROM chats c 
      JOIN empresas e ON c.empresa_id = e.empresa_id 
      WHERE c.transportista_id = ? AND c.activo = 1
      LIMIT 1`,
      [transportistaId]
    );
    
    if (chats.length === 0) {
      console.log('❌ No se encontró chat activo para transportista:', transportistaId);
      return res.status(404).json({ 
        success: false, 
        message: 'No se encontró un chat activo' 
      });
    }
    
    console.log(`Chat encontrado: ${chats[0].chatId}`);
    
    res.json({
      success: true,
      chatId: chats[0].chatId,
      empresaNombre: chats[0].nombre_empresa,
      empresaId: chats[0].empresa_id
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo chat:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

router.post('/:chatId/mensajes', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { remitente_tipo, mensaje } = req.body;
    
    console.log(`💬💬💬 ENVIANDO MENSAJE VÍA API - Chat: ${chatId}, Tipo: ${remitente_tipo}, Mensaje: ${mensaje.substring(0, 50)}...`);
    
    if (!remitente_tipo || !mensaje) {
      return res.status(400).json({
        success: false,
        error: 'remitente_tipo y mensaje son requeridos'
      });
    }
    
    const [chatInfo] = await db.execute(
      'SELECT empresa_id, transportista_id, cliente_id FROM chats WHERE id = ? AND activo = 1',
      [chatId]
    );
    
    if (chatInfo.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Chat no encontrado'
      });
    }
    
    const chat = chatInfo[0];
    if (chat.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para enviar mensajes en este chat'
      });
    }
    
    const [result] = await db.execute(
      'INSERT INTO mensajes (chat_id, remitente_tipo, mensaje) VALUES (?, ?, ?)',
      [chatId, remitente_tipo, mensaje]
    );
    
    const [nuevoMensaje] = await db.execute(
      `SELECT 
        id,
        mensaje,
        remitente_tipo as remitente,
        enviado_en,
        leido
      FROM mensajes 
      WHERE id = ?`,
      [result.insertId]
    );
    
    console.log(`💬 Mensaje guardado en BD - ID: ${result.insertId}, Chat: ${chatId}`);

    const io = req.app.get('socketio');
    if (io) {
      const mensajeData = {
        chatId: parseInt(chatId),
        mensajeId: result.insertId,
        mensaje: mensaje,
        remitente_tipo: remitente_tipo,  
        remitente: remitente_tipo,       
        timestamp: new Date(),
        enviado_en: nuevoMensaje[0].enviado_en,
        leido: false,
        empresa_id: chat.empresa_id,
        transportista_id: chat.transportista_id,
        cliente_id: chat.cliente_id  
      };
      
      const roomName = `chat_${chatId}`;
      console.log(`📢 Emitiendo evento WebSocket a sala: ${roomName}`);
      console.log(`   - Datos:`, {
        chatId: mensajeData.chatId,
        remitente_tipo: mensajeData.remitente_tipo,
        empresa_id: mensajeData.empresa_id,
        transportista_id: mensajeData.transportista_id,
        cliente_id: mensajeData.cliente_id
      });
      
      io.to(roomName).emit('nuevo-mensaje', mensajeData);
      console.log(`✅ Evento 'nuevo-mensaje' emitido a ${roomName}`);
    } else {
      console.log(`❌❌❌ ADVERTENCIA: Socket.io NO disponible - Chat NO será en tiempo real`);
    }
    
    res.json({
      success: true,
      mensaje: nuevoMensaje[0],
      message: 'Mensaje enviado exitosamente',
      socketEmitido: io ? true : false
    });
    
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al enviar mensaje' 
    });
  }
});

router.get('/empresa/:empresaId', authMiddleware, async (req, res) => {
  try {
    const { empresaId } = req.params;
    
    if (parseInt(empresaId) !== req.user.empresa_id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para acceder a esta empresa'
      });
    }
    
    console.log(`Obteniendo chats para empresa: ${empresaId}`);
    
    const query = `
      SELECT 
        c.id,
        c.transportista_id,
        t.nombre as nombre_transportista,
        t.telefono,
        t.vehiculo,
        t.estado as estado_transportista,
        (SELECT mensaje FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as ultimo_mensaje,
        (SELECT enviado_en FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as fecha_ultimo_mensaje,
        (SELECT COUNT(*) FROM mensajes WHERE chat_id = c.id AND leido = false AND remitente_tipo = 'transportista') as mensajes_no_leidos
      FROM chats c
      JOIN transportistas t ON c.transportista_id = t.id_transportista
      WHERE c.empresa_id = ? AND c.activo = 1
      ORDER BY fecha_ultimo_mensaje DESC
    `;
    
    const [chats] = await db.execute(query, [empresaId]);
    
    res.json({
      success: true,
      chats: chats,
      total: chats.length
    });
  } catch (error) {
    console.error('Error obteniendo chats de empresa:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

router.get('/transportista/:transportistaId', authMiddleware, async (req, res) => {
  try {
    const { transportistaId } = req.params;
    
    console.log(`Obteniendo chats para transportista: ${transportistaId}`);
    
    const [transportistaCheck] = await db.execute(
      'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
      [transportistaId]
    );
    
    if (transportistaCheck.length === 0 || transportistaCheck[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para acceder a este transportista'
      });
    }
    
    const query = `
      SELECT 
        c.id,
        c.empresa_id,
        e.nombre_empresa,
        e.telefono,
        (SELECT mensaje FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as ultimo_mensaje,
        (SELECT enviado_en FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as fecha_ultimo_mensaje,
        (SELECT COUNT(*) FROM mensajes WHERE chat_id = c.id AND leido = false AND remitente_tipo = 'empresa') as mensajes_no_leidos
      FROM chats c
      JOIN empresas e ON c.empresa_id = e.empresa_id
      WHERE c.transportista_id = ? AND c.activo = 1
      ORDER BY fecha_ultimo_mensaje DESC
    `;
    
    const [chats] = await db.execute(query, [transportistaId]);
    
    res.json({
      success: true,
      chats: chats,
      total: chats.length
    });
  } catch (error) {
    console.error('Error obteniendo chats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al obtener chats' 
    });
  }
});

router.post('/crear', authMiddleware, async (req, res) => {
  try {
    const { transportista_id } = req.body;  
    const empresa_id = req.user.empresa_id; 
    
    if (!transportista_id) {
      return res.status(400).json({
        success: false,
        error: 'transportista_id es requerido'
      });
    }
    
    console.log(`Creando chat - Transportista: ${transportista_id}, Empresa: ${empresa_id}`);
    
    const [transportistaCheck] = await db.execute(
      'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
      [transportista_id]
    );
    
    if (transportistaCheck.length === 0 || transportistaCheck[0].empresa_id !== empresa_id) {
      return res.status(403).json({
        success: false,
        error: 'El transportista no pertenece a esta empresa'
      });
    }
    
    const [chatExistente] = await db.execute(
      'SELECT id FROM chats WHERE transportista_id = ? AND empresa_id = ? AND activo = 1',
      [transportista_id, empresa_id]
    );
    
    if (chatExistente.length > 0) {
      console.log(`Chat existente encontrado: ${chatExistente[0].id}`);
      return res.json({
        success: true,
        chat: chatExistente[0],
        message: 'Chat ya existe'
      });
    }
    
    const [result] = await db.execute(
      `INSERT INTO chats (empresa_id, transportista_id, cliente_id, activo) 
       VALUES (?, ?, ?, 1)`,
      [empresa_id, transportista_id, null]  
    );
    
    console.log(`Nuevo chat creado: ${result.insertId}`);
    
    res.json({ 
      success: true,
      chat: {
        id: result.insertId, 
        empresa_id, 
        transportista_id
      },
      message: 'Chat creado exitosamente'
    });
  } catch (error) {
    console.error('Error creando chat:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al crear chat' 
    });
  }
});
router.put('/:chatId/mensajes/leer', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { remitente_tipo } = req.body;
    
    console.log(`📖 Marcando mensajes como leídos - Chat: ${chatId}, Remitente: ${remitente_tipo}`);
    
    if (!remitente_tipo) {
      return res.status(400).json({
        success: false,
        error: 'remitente_tipo es requerido'
      });
    }
    const [chatCheck] = await db.execute(
      'SELECT empresa_id, cliente_id FROM chats WHERE id = ?',
      [chatId]
    );
    
    if (chatCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Chat no encontrado'
      });
    }
    
    const chat = chatCheck[0];
    
    if (chat.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para este chat'
      });
    }
    
    let remitente_a_marcar;
    
    switch(remitente_tipo.toLowerCase()) {
      case 'empresa':
        remitente_a_marcar = 'transportista';
        console.log(`🏢 Empresa marcando mensajes de transportista como leídos`);
        break;
        
      case 'transportista':
        if (chat.cliente_id) {
          remitente_a_marcar = 'cliente';
          console.log(`🚚 Transportista marcando mensajes de CLIENTE como leídos`);
        } else {
          remitente_a_marcar = 'empresa';
          console.log(`🚚 Transportista marcando mensajes de EMPRESA como leídos`);
        }
        break;
        
      case 'cliente':
        remitente_a_marcar = 'transportista';
        console.log(`👤 Cliente marcando mensajes de transportista como leídos`);
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'remitente_tipo no válido'
        });
    }
    
    console.log(`🎯 Remitente a marcar: ${remitente_a_marcar}`);
    const [mensajesAntes] = await db.execute(
      `SELECT COUNT(*) as total FROM mensajes 
       WHERE chat_id = ? 
       AND remitente_tipo = ?`,
      [chatId, remitente_a_marcar]
    );
    
    const [mensajesNoLeidosAntes] = await db.execute(
      `SELECT COUNT(*) as no_leidos FROM mensajes 
       WHERE chat_id = ? 
       AND remitente_tipo = ?
       AND (leido = false OR leido IS NULL OR leido = 0)`,
      [chatId, remitente_a_marcar]
    );
    
    console.log(`🔍 ANTES - Total mensajes de ${remitente_a_marcar}: ${mensajesAntes[0].total}`);
    console.log(`🔍 ANTES - Mensajes no leídos: ${mensajesNoLeidosAntes[0].no_leidos}`);
    
    const [result] = await db.execute(
      `UPDATE mensajes 
       SET leido = true 
       WHERE chat_id = ? 
       AND (leido = false OR leido IS NULL OR leido = 0)
       AND remitente_tipo = ?`,
      [chatId, remitente_a_marcar]
    );
    
    console.log(`✅ DESPUÉS - Mensajes actualizados: ${result.affectedRows}`);
    
    const [mensajesNoLeidosDespues] = await db.execute(
      `SELECT COUNT(*) as no_leidos FROM mensajes 
       WHERE chat_id = ? 
       AND remitente_tipo = ?
       AND (leido = false OR leido IS NULL OR leido = 0)`,
      [chatId, remitente_a_marcar]
    );
    
    console.log(`🔍 DESPUÉS - Mensajes no leídos restantes: ${mensajesNoLeidosDespues[0].no_leidos}`);
    
    res.json({
      success: true,
      mensajes_actualizados: result.affectedRows,
      mensajes_no_leidos_antes: mensajesNoLeidosAntes[0].no_leidos,
      mensajes_no_leidos_despues: mensajesNoLeidosDespues[0].no_leidos,
      remitente_a_marcar: remitente_a_marcar,
      message: 'Mensajes marcados como leídos exitosamente'
    });
    
  } catch (error) {
    console.error('❌ Error marcando mensajes como leídos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al marcar mensajes como leídos'
    });
  }
});
router.post('/cliente-transportista', authMiddleware, async (req, res) => {
  try {
    const { cliente_id, transportista_id, pedido_id } = req.body;
    
    console.log(`Creando chat cliente-transportista - Cliente: ${cliente_id}, Transportista: ${transportista_id}`);
    
    if (!cliente_id || !transportista_id) {
      return res.status(400).json({
        success: false,
        error: 'cliente_id y transportista_id son requeridos'
      });
    }
    const [clienteCheck] = await db.execute(
      'SELECT id_cliente FROM clientes WHERE id_cliente = ?',
      [cliente_id]
    );
    
    if (clienteCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }
    const [transportistaCheck] = await db.execute(
      'SELECT id_transportista FROM transportistas WHERE id_transportista = ?',
      [transportista_id]
    );
    
    if (transportistaCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transportista no encontrado'
      });
    }
    const [chatExistente] = await db.execute(
      `SELECT id FROM chats 
       WHERE cliente_id = ? AND transportista_id = ? AND activo = 1`,
      [cliente_id, transportista_id]
    );
    
    if (chatExistente.length > 0) {
      console.log(`Chat existente encontrado: ${chatExistente[0].id}`);
      return res.json({
        success: true,
        chatId: chatExistente[0].id,
        message: 'Chat ya existe',
        exists: true
      });
    }
    const [result] = await db.execute(
      `INSERT INTO chats (empresa_id, transportista_id, cliente_id, activo) 
       VALUES (?, ?, ?, 1)`,
      [req.user.empresa_id, transportista_id, cliente_id]
    );
    
    console.log(`Nuevo chat cliente-transportista creado: ${result.insertId}`);
    
    res.status(201).json({ 
      success: true,
      chatId: result.insertId,
      message: 'Chat creado exitosamente'
    });
    
  } catch (error) {
    console.error('Error creando chat cliente-transportista:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al crear chat' 
    });
  }
});
router.get('/cliente/:clienteId', authMiddleware, async (req, res) => {
  try {
    const { clienteId } = req.params;

    const query = `
      SELECT 
        c.id,
        c.transportista_id,
        c.id_envio,
        t.nombre as nombre_transportista,
        t.telefono,
        t.vehiculo,
        e.estado as estado_envio,
        p.descripcion as descripcion_pedido,
        (SELECT mensaje FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as ultimo_mensaje,
        (SELECT enviado_en FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as fecha_ultimo_mensaje,
        (SELECT COUNT(*) FROM mensajes WHERE chat_id = c.id AND leido = false AND remitente_tipo = 'transportista') as mensajes_no_leidos,
        c.actualizado_en
      FROM chats c
      INNER JOIN transportistas t ON c.transportista_id = t.id_transportista
      LEFT JOIN envios e ON c.id_envio = e.id_envio
      LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
      WHERE c.cliente_id = ? 
        AND c.activo = 1 
        AND c.cliente_id IS NOT NULL
        AND c.empresa_id = ?
      ORDER BY c.actualizado_en DESC
    `;
    
    const [chats] = await db.execute(query, [clienteId, req.user.empresa_id]);
    
    const chatsFormateados = chats.map(chat => ({
      id: chat.id,
      transportista_id: chat.transportista_id,
      id_envio: chat.id_envio,
      nombre_transportista: chat.nombre_transportista || 'Transportista',
      telefono: chat.telefono,
      vehiculo: chat.vehiculo,
      estado_envio: chat.estado_envio,
      descripcion_pedido: chat.descripcion_pedido,
      ultimo_mensaje: chat.ultimo_mensaje || 'Sin mensajes aún',
      fecha_ultimo_mensaje: chat.fecha_ultimo_mensaje,
      mensajes_no_leidos: chat.mensajes_no_leidos || 0,
      actualizado_en: chat.actualizado_en
    }));
    
    res.json({
      success: true,
      chats: chatsFormateados,
      total: chatsFormateados.length
    });
    
  } catch (error) {
    console.error('Error obteniendo chats del cliente:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});
router.get('/transportista/:transportistaId/todos', authMiddleware, async (req, res) => {
  try {
    const { transportistaId } = req.params;
    
    console.log(`Obteniendo TODOS los chats para transportista: ${transportistaId}`);
    
    const query = `
      SELECT 
        c.id,
        c.empresa_id,
        c.cliente_id,
        -- Si tiene cliente_id es chat con cliente, sino con empresa
        CASE 
          WHEN c.cliente_id IS NOT NULL THEN 'cliente_transportista'
          ELSE 'empresa_transportista'
        END as tipo_chat,
        COALESCE(
          cl.cedula, 
          e.nombre_empresa
        ) as otro_usuario_nombre,
        COALESCE(
          (SELECT mensaje FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1),
          'Nuevo chat'
        ) as ultimo_mensaje,
        COALESCE(
          (SELECT enviado_en FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1),
          c.creado_en
        ) as fecha_ultimo_mensaje,
        (SELECT COUNT(*) FROM mensajes WHERE chat_id = c.id AND leido = false AND remitente_tipo != 'transportista') as mensajes_no_leidos,
        c.actualizado_en
      FROM chats c
      LEFT JOIN empresas e ON c.empresa_id = e.empresa_id AND c.cliente_id IS NULL
      LEFT JOIN clientes cl ON c.cliente_id = cl.id_cliente AND c.cliente_id IS NOT NULL
      WHERE c.transportista_id = ? 
        AND c.activo = 1
        AND (c.cliente_id IS NOT NULL OR c.empresa_id = ?)
      GROUP BY c.id, c.empresa_id, c.cliente_id
      ORDER BY fecha_ultimo_mensaje DESC
    `;
    
    const [chats] = await db.execute(query, [transportistaId, req.user.empresa_id]);
    
    console.log(`✅ ${chats.length} chats únicos encontrados para transportista ${transportistaId}`);
    
    res.json({
      success: true,
      chats: chats,
      total: chats.length
    });
    
  } catch (error) {
    console.error('Error obteniendo todos los chats del transportista:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al obtener chats' 
    });
  }
});
router.get('/cliente-transportista/:chatId/detalles', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    console.log(`Obteniendo detalles del chat cliente-transportista: ${chatId}`);
    
    const query = `
      SELECT 
        c.id,
        c.transportista_id,
        t.nombre as nombre_transportista,
        t.telefono as telefono_transportista,
        t.vehiculo,
        c.cliente_id,
        cl.cedula as cedula_cliente,
        u.correo as email_cliente
      FROM chats c
      JOIN transportistas t ON c.transportista_id = t.id_transportista
      JOIN clientes cl ON c.cliente_id = cl.id_cliente
      JOIN usuarios u ON cl.id_usuario = u.id_usuario
      WHERE c.id = ? AND c.activo = 1 AND c.cliente_id IS NOT NULL
    `;
    
    const [chatDetails] = await db.execute(query, [chatId]);
    
    if (chatDetails.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Chat cliente-transportista no encontrado'
      });
    }
    
    console.log(`Detalles del chat ${chatId} obtenidos correctamente`);
    
    res.json({
      success: true,
      chat: chatDetails[0]
    });
    
  } catch (error) {
    console.error('Error obteniendo detalles del chat:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});
router.get('/transportista/:transportistaId/empresas-con-viajes', authMiddleware, async (req, res) => {
  try {
    const { transportistaId } = req.params;
    
    console.log(`Obteniendo empresas con viajes para transportista: ${transportistaId}`);
    const [transportistaCheck] = await db.execute(
      'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
      [transportistaId]
    );
    
    if (transportistaCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transportista no encontrado'
      });
    }
    const query = `
      SELECT DISTINCT
        e.empresa_id as id,
        e.nombre_empresa,
        e.telefono,
        e.direccion,
        COUNT(p.id_pedido) as total_viajes,
        MAX(p.fecha_creacion) as ultimo_viaje
      FROM empresas e
      JOIN pedidos p ON e.empresa_id = p.empresa_id
      JOIN envios env ON p.id_pedido = env.pedido_id
      WHERE env.transportista_id = ? 
        AND env.estado IN ('ASIGNADO', 'EN CAMINO', 'ENTREGADO')
        AND e.empresa_id = ?
      GROUP BY e.empresa_id, e.nombre_empresa
      ORDER BY ultimo_viaje DESC
    `;
    
    const [empresas] = await db.execute(query, [transportistaId, req.user.empresa_id]);
    
    console.log(`✅ ${empresas.length} empresas con viajes encontradas`);
    
    res.json({
      success: true,
      empresas: empresas
    });
    
  } catch (error) {
    console.error('Error obteniendo empresas con viajes:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Módulo de chat funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});
router.get('/envio/:idEnvio', authMiddleware, async (req, res) => {
  try {
    const { idEnvio } = req.params;
    
    console.log(`Buscando chat para envío: ${idEnvio}`);
    
    const envioQuery = `
      SELECT 
        e.id_envio,
        e.id_pedido,
        e.id_transportista,
        e.estado,
        e.empresa_id,
        p.id_cliente as id_cliente,  -- ← Asegúrate de usar AS para el alias
        p.descripcion,
        t.nombre as nombre_transportista,
        cl.cedula as cedula_cliente
      FROM envios e
      JOIN pedidos p ON e.id_pedido = p.id_pedido
      JOIN transportistas t ON e.id_transportista = t.id_transportista
      JOIN clientes cl ON p.id_cliente = cl.id_cliente
      WHERE e.id_envio = ?
    `;
    
    const [envios] = await db.execute(envioQuery, [idEnvio]);
    
    if (envios.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Envío no encontrado'
      });
    }
    
    const envio = envios[0];
    
    console.log('DEBUG - Datos del envío obtenidos:', {
      id_envio: envio.id_envio,
      id_pedido: envio.id_pedido,
      id_transportista: envio.id_transportista,
      empresa_id: envio.empresa_id,
      id_cliente: envio.id_cliente,
      tiene_id_cliente: typeof envio.id_cliente !== 'undefined'
    });
    
    const chatQuery = `
      SELECT * FROM chats WHERE id_envio = ?
    `;
    
    const [chats] = await db.execute(chatQuery, [idEnvio]);
    
    let chat;
    if (chats.length === 0) {
      console.log(`Creando nuevo chat para envío ${idEnvio}`);
      
      const insertChatQuery = `
        INSERT INTO chats (empresa_id, transportista_id, cliente_id, id_envio, activo)
        VALUES (?, ?, ?, ?, 1)
      `;

      const clienteId = envio.id_cliente || null;
      console.log('DEBUG - Valores para INSERT:', {
        empresa_id: envio.empresa_id,
        id_transportista: envio.id_transportista,
        id_cliente: clienteId,
        idEnvio: idEnvio
      });
      
      const [result] = await db.execute(insertChatQuery, [
        envio.empresa_id,
        envio.id_transportista,
        clienteId, 
        idEnvio
      ]);
      
      chat = {
        id: result.insertId,
        empresa_id: envio.empresa_id,
        transportista_id: envio.id_transportista,
        cliente_id: clienteId,
        id_envio: parseInt(idEnvio),
        activo: 1,
        creado_en: new Date()
      };
      
      console.log(`Nuevo chat creado: ${result.insertId} para envío ${idEnvio}`);
    } else {
      chat = chats[0];
      console.log(`Chat existente encontrado: ${chat.id} para envío ${idEnvio}`);
    }
    
    const mensajesQuery = `
      SELECT 
        id,
        mensaje,
        remitente_tipo as remitente,
        enviado_en,
        leido
      FROM mensajes 
      WHERE chat_id = ? 
      ORDER BY enviado_en ASC
    `;
    
    const [mensajes] = await db.execute(mensajesQuery, [chat.id]);

    res.json({
      success: true,
      chat: chat,
      mensajes: mensajes,
      envio: {
        id: envio.id_envio,
        pedido_id: envio.id_pedido,
        estado: envio.estado,
        descripcion: envio.descripcion,
        transportista: envio.nombre_transportista,
        cliente_cedula: envio.cedula_cliente
      }
    });

  } catch (error) {
    console.error('Error en chat por envío:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al obtener chat del envío' 
    });
  }
});
router.get('/cliente/:clienteId/envios', authMiddleware, async (req, res) => {
  try {
    const { clienteId } = req.params;
    
    console.log(`Obteniendo chats con envíos para cliente: ${clienteId}`);
    
    const query = `
      SELECT 
        c.id,
        c.transportista_id,
        c.id_envio,
        t.nombre as nombre_transportista,
        t.telefono,
        t.vehiculo,
        e.estado as estado_envio,
        p.descripcion as descripcion_pedido,
        (SELECT mensaje FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as ultimo_mensaje,
        (SELECT enviado_en FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as fecha_ultimo_mensaje,
        (SELECT COUNT(*) FROM mensajes WHERE chat_id = c.id AND leido = false AND remitente_tipo = 'transportista') as mensajes_no_leidos,
        c.actualizado_en
      FROM chats c
      JOIN transportistas t ON c.transportista_id = t.id_transportista
      LEFT JOIN envios e ON c.id_envio = e.id_envio
      LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
      WHERE c.cliente_id = ? AND c.activo = 1 AND c.id_envio IS NOT NULL
      ORDER BY fecha_ultimo_mensaje DESC
    `;
    
    const [chats] = await db.execute(query, [clienteId]);
    
    console.log(`✅ ${chats.length} chats con envíos encontrados para cliente ${clienteId}`);
    
    res.json({
      success: true,
      chats: chats,
      total: chats.length
    });
    
  } catch (error) {
    console.error('Error obteniendo chats con envíos del cliente:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});
router.get('/cliente/:clienteId/chats-transportistas', authMiddleware, async (req, res) => {
  try {
    const { clienteId } = req.params;
    
    console.log(`Obteniendo chats con transportistas para cliente: ${clienteId}`);
    console.log('Empresa del usuario:', req.user.empresa_id);

    const query = `
      SELECT 
        c.id,
        c.transportista_id,
        c.id_envio,
        t.nombre as nombre_transportista,
        t.telefono,
        t.vehiculo,
        e.estado as estado_envio,
        p.descripcion as descripcion_pedido,
        (SELECT mensaje FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as ultimo_mensaje,
        (SELECT enviado_en FROM mensajes WHERE chat_id = c.id ORDER BY enviado_en DESC LIMIT 1) as fecha_ultimo_mensaje,
        (SELECT COUNT(*) FROM mensajes WHERE chat_id = c.id AND leido = false AND remitente_tipo = 'transportista') as mensajes_no_leidos,
        c.actualizado_en
      FROM chats c
      INNER JOIN transportistas t ON c.transportista_id = t.id_transportista
      LEFT JOIN envios e ON c.id_envio = e.id_envio
      LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
      WHERE c.cliente_id = ? 
        AND c.activo = 1 
        AND c.cliente_id IS NOT NULL
        AND c.empresa_id = ?
      ORDER BY c.actualizado_en DESC
    `;
    
    const [chats] = await db.execute(query, [clienteId, req.user.empresa_id]);
    
    console.log(`✅ ${chats.length} chats con transportistas encontrados para cliente ${clienteId}`);
    const chatsFormateados = chats.map(chat => ({
      id: chat.id,
      transportista_id: chat.transportista_id,
      id_envio: chat.id_envio,
      nombre_transportista: `${chat.nombre_transportista || ''}`.trim() || 'Transportista',
      telefono: chat.telefono,
      vehiculo: chat.vehiculo,
      estado_envio: chat.estado_envio,
      descripcion_pedido: chat.descripcion_pedido,
      ultimo_mensaje: chat.ultimo_mensaje || 'Sin mensajes aún',
      fecha_ultimo_mensaje: chat.fecha_ultimo_mensaje,
      mensajes_no_leidos: chat.mensajes_no_leidos || 0,
      actualizado_en: chat.actualizado_en
    }));
    
    res.json({
      success: true,
      chats: chatsFormateados,
      total: chatsFormateados.length
    });
    
  } catch (error) {
    console.error('Error obteniendo chats del cliente:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al obtener chats del cliente' 
    });
  }
});
router.post('/crear-automatico', authMiddleware, async (req, res) => {
  try {
    const { pedido_id } = req.body;
    const empresa_id = req.user.empresa_id;
    
    console.log(`🤖 Creando chat automático para pedido: ${pedido_id}`);

    if (!pedido_id) {
      return res.status(400).json({
        success: false,
        error: 'pedido_id es requerido'
      });
    }
    const [pedidoInfo] = await db.execute(`
      SELECT 
        p.id_pedido,
        p.id_cliente,
        e.id_transportista,
        t.nombre as nombre_transportista,
        cl.cedula as cedula_cliente
      FROM pedidos p
      JOIN envios e ON p.id_pedido = e.id_pedido
      JOIN transportistas t ON e.id_transportista = t.id_transportista
      JOIN clientes cl ON p.id_cliente = cl.id_cliente
      WHERE p.id_pedido = ? AND p.empresa_id = ?
    `, [pedido_id, empresa_id]);

    if (pedidoInfo.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoInfo[0];
    const { id_cliente, id_transportista, nombre_transportista } = pedido;
    const [chatExistente] = await db.execute(
      `SELECT id FROM chats 
       WHERE cliente_id = ? AND transportista_id = ? AND activo = 1
       AND empresa_id = ?`,
      [id_cliente, id_transportista, empresa_id]
    );
    
    if (chatExistente.length > 0) {
      console.log(`✅ Chat ya existe: ${chatExistente[0].id}`);
      return res.json({
        success: true,
        chatId: chatExistente[0].id,
        message: 'Chat ya existe',
        exists: true
      });
    }
    
    const [result] = await db.execute(
      `INSERT INTO chats (empresa_id, transportista_id, cliente_id, activo) 
       VALUES (?, ?, ?, 1)`,
      [empresa_id, id_transportista, id_cliente]
    );
    
    const nuevoChatId = result.insertId;
    
    console.log(`✅ Chat automático creado: ${nuevoChatId} para pedido ${pedido_id}`);
    const mensajeBienvenida = `Hola! Soy ${nombre_transportista}, tu transportista asignado para el pedido #${pedido_id}. Estoy aquí para ayudarte con tu envío.`;
    
    await db.execute(
      'INSERT INTO mensajes (chat_id, remitente_tipo, mensaje) VALUES (?, "transportista", ?)',
      [nuevoChatId, mensajeBienvenida]
    );
    
    res.status(201).json({ 
      success: true,
      chatId: nuevoChatId,
      message: 'Chat creado automáticamente',
      pedido_id: pedido_id,
      cliente_id: id_cliente,
      transportista_id: id_transportista
    });
    
  } catch (error) {
    console.error('❌ Error creando chat automático:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor al crear chat automático' 
    });
  }
});
module.exports = router;