const express = require('express');
const router = express.Router();
const pool = require('../models/database');
const bcrypt = require('bcrypt');
const { generarToken } = require('../middleware/auth'); 
router.get('/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    
    console.log('👤 Obteniendo información del cliente:', clienteId);

    const sql = `
      SELECT 
        c.id_cliente,
        c.cedula,
        u.correo as email,
        u.id_usuario
      FROM clientes c
      JOIN usuarios u ON c.id_usuario = u.id_usuario
      WHERE c.id_cliente = ?
    `;

    const [rows] = await pool.query(sql, [clienteId]);

    if (rows.length === 0) {
      console.log('❌ Cliente no encontrado:', clienteId);
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    const cliente = rows[0];
    
    console.log('✅ Cliente encontrado:', {
      id: cliente.id_cliente,
      cedula: cliente.cedula,
      email: cliente.email
    });

    res.json({
      success: true,
      cliente: {
        id_cliente: cliente.id_cliente,
        cedula: cliente.cedula,
        email: cliente.email,
        id_usuario: cliente.id_usuario
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo información del cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor: ' + error.message
    });
  }
});
router.get('/usuario/:usuarioId', async (req, res) => {
  const { usuarioId } = req.params;

  console.log('🔍 Buscando clienteId para usuario:', usuarioId);

  try {
    const [clientes] = await pool.query(
      'SELECT id_cliente FROM clientes WHERE id_usuario = ?',
      [usuarioId]
    );

    if (clientes.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cliente no encontrado' 
      });
    }

    res.json({
      success: true,
      cliente: {
        id_cliente: clientes[0].id_cliente
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo clienteId:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor: ' + error.message 
    });
  }
});
router.post('/ubicacion', async (req, res) => {
  try {
    const { clienteId, latitud, longitud } = req.body;
    
    console.log('📍 Guardando ubicación cliente:', { clienteId, latitud, longitud });
    await db.query(
      'UPDATE clientes SET latitud = ?, longitud = ? WHERE id_cliente = ?',
      [latitud, longitud, clienteId]
    );
    
    res.json({ success: true, message: 'Ubicación guardada' });
  } catch (error) {
    console.error('❌ Error guardando ubicación cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;