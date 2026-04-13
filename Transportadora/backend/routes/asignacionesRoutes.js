const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { authMiddleware } = require('../middleware/auth'); 
router.post('/asignar', authMiddleware, async (req, res) => { 
  try {
    const { id_pedido, id_transportista } = req.body;

    if (!id_pedido || !id_transportista) {
      return res.status(400).json({ success: false, message: 'Faltan datos' });
    }

    const [pedidoCheck] = await db.query(
      'SELECT empresa_id FROM pedidos WHERE id_pedido = ?',
      [id_pedido]
    );
    
    if (pedidoCheck.length === 0 || pedidoCheck[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para asignar este pedido' 
      });
    }
    const [transportistaCheck] = await db.query(
      'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
      [id_transportista]
    );
    
    if (transportistaCheck.length === 0 || transportistaCheck[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para asignar este transportista' 
      });
    }

    await db.query(
      'INSERT INTO asignaciones (id_pedido, id_transportista, estado, empresa_id) VALUES (?, ?, ?, ?)', 
      [id_pedido, id_transportista, 'PENDIENTE', req.user.empresa_id] 
    );

    return res.json({ success: true, message: 'Transportista asignado con éxito' });

  } catch (err) {
    console.error('Error al asignar transportista:', err);
    return res.status(500).json({ success: false, message: 'Error al asignar transportista' });
  }
});

router.put('/responder/:id_asignacion', authMiddleware, async (req, res) => { 
  try {
    const { estado } = req.body; 
    const { id_asignacion } = req.params;

    if (!['ACEPTADO', 'RECHAZADO'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }
    const [asignacionCheck] = await db.query(
      'SELECT empresa_id FROM asignaciones WHERE id_asignacion = ?',
      [id_asignacion]
    );
    
    if (asignacionCheck.length === 0 || asignacionCheck[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para responder esta asignación' 
      });
    }

    const [result] = await db.query(
      'UPDATE asignaciones SET estado = ? WHERE id_asignacion = ?',
      [estado, id_asignacion]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
    }

    return res.json({ success: true, message: `Asignación ${estado}` });

  } catch (err) {
    console.error('Error al actualizar asignación:', err);
    return res.status(500).json({ success: false, message: 'Error al actualizar asignación' });
  }
});

router.get('/pendientes/:id_transportista', authMiddleware, async (req, res) => { 
  try {
    const { id_transportista } = req.params;
    const [transportistaCheck] = await db.query(
      'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
      [id_transportista]
    );
    
    if (transportistaCheck.length === 0 || transportistaCheck[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ 
        success: false, 
        message: 'No tienes permisos para ver asignaciones de este transportista' 
      });
    }

    const [rows] = await db.query(
      `SELECT a.id_asignacion, a.id_pedido, p.descripcion, p.direccion_origen, p.direccion_destino, p.fecha_envio
       FROM asignaciones a
       JOIN pedidos p ON a.id_pedido = p.id_pedido
       WHERE a.id_transportista = ? AND a.estado = 'PENDIENTE'
       AND a.empresa_id = ?`, 
      [id_transportista, req.user.empresa_id] 
    );

    return res.json({
      success: true,
      asignaciones: rows,
      total: rows.length
    });

  } catch (err) {
    console.error('Error al obtener asignaciones pendientes:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener asignaciones' });
  }
});
router.get('/transportistas', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.id_transportista, t.nombre, t.telefono, t.vehiculo, t.estado
       FROM transportistas t
       WHERE t.empresa_id = ?  
       AND t.estado = 'Libre'`,
      [req.user.empresa_id] 
    );
    
    return res.json({
      success: true,
      transportistas: rows,
      total: rows.length
    });
    
  } catch (err) {
    console.error('Error al obtener transportistas:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener transportistas' });
  }
});

module.exports = router;