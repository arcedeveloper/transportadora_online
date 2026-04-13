const express = require('express');
const router = express.Router();
const pool = require('../models/database');
const { authMiddleware } = require('../middleware/auth'); 
router.get('/libres', authMiddleware, async (req, res) => {
    try {
        console.log('🚚 Solicitando transportistas LIBRES...');
        console.log('🏢 Empresa del usuario:', req.user.empresa_id);
        
        const [transportistas] = await pool.query(
            `SELECT 
                t.id_transportista, 
                t.nombre, 
                t.telefono, 
                t.vehiculo, 
                t.peso_maximo, 
                t.estado,
                t.cedula,
                t.licencia,
                t.empresa_id,
                e.nombre_empresa,
                u.correo,
                '🟢 En línea' as estado_chat
             FROM transportistas t
             INNER JOIN usuarios u ON t.id_usuario = u.id_usuario
             INNER JOIN empresas e ON t.empresa_id = e.empresa_id
             WHERE t.estado = 'Libre'  
             ORDER BY t.nombre`
        );
        
        console.log(`Transportistas LIBRES encontrados: ${transportistas.length}`);
        
        if (transportistas.length > 0) {
            console.log('📋 Lista de transportistas LIBRES:');
            transportistas.forEach((t, index) => {
                console.log(`   ${index + 1}. ${t.nombre} - ${t.vehiculo} - Empresa: ${t.empresa_id} (${t.nombre_empresa})`);
            });
        } else {
            console.log('ℹ️  No se encontraron transportistas libres');
        }
        
        res.json(transportistas);
        
    } catch (err) {
        console.error('❌ Error GET /libres:', err);
        res.status(500).json({ 
            message: 'Error interno del servidor al obtener transportistas libres.',
            error: err.message 
        });
    }
}); 
router.get('/todos', authMiddleware, async (req, res) => {
    try {
        console.log('🔄 Solicitando todos los transportistas...');
        console.log('🏢 Empresa del usuario:', req.user.empresa_id);
        
        const [transportistas] = await pool.query(
            `SELECT 
                t.id_transportista, 
                t.nombre, 
                t.telefono, 
                t.vehiculo, 
                t.peso_maximo, 
                t.estado,
                t.cedula,
                t.licencia,
                t.empresa_id,
                e.nombre_empresa,
                u.correo
             FROM transportistas t
             INNER JOIN usuarios u ON t.id_usuario = u.id_usuario
             INNER JOIN empresas e ON t.empresa_id = e.empresa_id
             ORDER BY t.estado, t.nombre`
        );
        
        console.log(`✅ Total transportistas encontrados: ${transportistas.length}`);
        res.json(transportistas);
        
    } catch (err) {
        console.error('❌ Error GET /todos:', err);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

router.get('/perfil/:id', authMiddleware, async (req, res) => {
    const idTransportista = req.params.id;
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        console.log('🏢 Verificando empresa del transportista...');
                const [empresaCheck] = await connection.query(
            'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
            [idTransportista]
        );
        
        if (empresaCheck.length === 0) {
            return res.status(404).json({ message: 'Transportista no encontrado.' });
        }
        
        if (empresaCheck[0].empresa_id !== req.user.empresa_id) {
            return res.status(403).json({ 
                message: 'No tienes permisos para ver este transportista.' 
            });
        }

        const [viajesActivos] = await connection.query(
            `SELECT COUNT(*) as count FROM envios 
             WHERE id_transportista = ? 
             AND estado IN ('Pendiente', 'ACEPTADO', 'EN CAMINO')`,
            [idTransportista]
        );

        const tieneViajesActivos = viajesActivos[0].count > 0;

        if (!tieneViajesActivos) {
            const [transportistaActual] = await connection.query(
                'SELECT estado FROM transportistas WHERE id_transportista = ?',
                [idTransportista]
            );
            
            if (transportistaActual.length > 0 && transportistaActual[0].estado === 'Ocupado') {
                await connection.query(
                    'UPDATE transportistas SET estado = "Libre" WHERE id_transportista = ?',
                    [idTransportista]
                );
                console.log(`✅ Transportista ${idTransportista} liberado automáticamente (sin viajes activos)`);
            }
        }

        const [rows] = await connection.query(
            `SELECT 
                t.id_transportista, 
                t.nombre, 
                t.telefono, 
                t.vehiculo, 
                t.peso_maximo, 
                t.estado,
                t.cedula,
                t.licencia,
                u.correo
             FROM transportistas t
             INNER JOIN usuarios u ON t.id_usuario = u.id_usuario
             WHERE t.id_transportista = ?`,
            [idTransportista]
        );

        if (rows.length === 0) return res.status(404).json({ message: 'Transportista no encontrado.' });

        const transportista = rows[0];

        const [envios] = await connection.query(
            `SELECT 
                e.id_envio, 
                e.id_pedido, 
                p.direccion_origen AS ciudad_origen, 
                p.direccion_destino AS ciudad_destino, 
                p.fecha_envio, 
                p.tipo_carga,
                p.descripcion, 
                p.costo,
                p.latitud_origen,
                p.longitud_origen,
                p.latitud_destino,
                p.longitud_destino,
                IFNULL(e.estado, 'Pendiente') AS estado
             FROM envios e
             JOIN pedidos p ON e.id_pedido = p.id_pedido
             WHERE e.id_transportista = ?
             AND p.empresa_id = ?  
             ORDER BY p.fecha_envio ASC`,
            [idTransportista, req.user.empresa_id]  
        );

        res.json({ ...transportista, envios });

    } catch (err) {
        console.error('Error GET /perfil/:id:', err);
        res.status(500).json({ message: 'Error interno del servidor.' });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/:id/pedidos', authMiddleware, async (req, res) => { 
    const idTransportista = req.params.id;
    try {
        const [empresaCheck] = await pool.query(
            'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
            [idTransportista]
        );
        
        if (empresaCheck.length === 0 || empresaCheck[0].empresa_id !== req.user.empresa_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'No tienes permisos para ver estos pedidos.' 
            });
        }

        const [rows] = await pool.query(
            `SELECT 
                p.id_pedido, 
                p.direccion_origen AS ciudad_origen, 
                p.direccion_destino AS ciudad_destino, 
                p.fecha_envio,
                p.tipo_carga, 
                p.descripcion, 
                p.costo,
                p.latitud_origen,
                p.longitud_origen,
                p.latitud_destino,
                p.longitud_destino,
                IFNULL(e.estado, 'Pendiente') AS estado
             FROM pedidos p
             LEFT JOIN envios e 
                ON p.id_pedido = e.id_pedido AND e.id_transportista = ?
             WHERE p.id_pedido IN (
                 SELECT id_pedido 
                 FROM envios 
                 WHERE id_transportista = ?
             )
             AND p.empresa_id = ?  
             ORDER BY p.fecha_envio ASC`,
            [idTransportista, idTransportista, req.user.empresa_id]  
        );

        res.json({ success: true, pedidos: rows });
    } catch (err) {
        console.error('Error GET /:id/pedidos:', err);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});


router.put('/:id', authMiddleware, async (req, res) => { 
    const idTransportista = req.params.id;
    const { nombre, telefono, vehiculo, peso_maximo } = req.body;

    try {
        const [empresaCheck] = await pool.query(
            'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
            [idTransportista]
        );
        
        if (empresaCheck.length === 0 || empresaCheck[0].empresa_id !== req.user.empresa_id) {
            return res.status(403).json({ 
                message: 'No tienes permisos para actualizar este transportista.' 
            });
        }

        const [result] = await pool.query(
            'UPDATE transportistas SET nombre = ?, telefono = ?, vehiculo = ?, peso_maximo = ? WHERE id_transportista = ?',
            [nombre, telefono, vehiculo, peso_maximo, idTransportista]
        );

        if (result.affectedRows === 0) return res.status(404).json({ message: 'Transportista no encontrado.' });

        res.json({ message: 'Perfil actualizado correctamente.' });
    } catch (err) {
        console.error('Error PUT /:id:', err);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});
router.put('/:id/pedidos/:idEnvio/estado', authMiddleware, async (req, res) => { 
    const idTransportista = req.params.id;
    const idEnvio = req.params.idEnvio;
    const { estado } = req.body;

    if (!["Pendiente", "ACEPTADO", "ENTREGADO", "RECHAZADO"].includes(estado)) {
        return res.status(400).json({ message: 'Estado inválido.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [empresaCheck] = await connection.query(
            'SELECT empresa_id FROM transportistas WHERE id_transportista = ?',
            [idTransportista]
        );
        
        if (empresaCheck.length === 0 || empresaCheck[0].empresa_id !== req.user.empresa_id) {
            await connection.rollback();
            return res.status(403).json({ 
                message: 'No tienes permisos para actualizar este envío.' 
            });
        }

        if (estado === "ACEPTADO") {
            const [result] = await connection.query(
                `UPDATE envios 
                 SET estado = ?, aprobado_por = ? 
                 WHERE id_envio = ? AND id_transportista = ?`,
                [estado, idTransportista, idEnvio, idTransportista]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Envío no encontrado o no asignado a este transportista.' });
            }

        } else {
            const [result] = await connection.query(
                `UPDATE envios 
                 SET estado = ? 
                 WHERE id_envio = ? AND id_transportista = ?`,
                [estado, idEnvio, idTransportista]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Envío no encontrado o no asignado a este transportista.' });
            }
        }

        if (estado === "ENTREGADO") {
            await connection.query(
                'UPDATE transportistas SET estado = "Libre" WHERE id_transportista = ?',
                [idTransportista]
            );
            console.log(`✅ Transportista ${idTransportista} liberado automáticamente`);
        }

        await connection.commit();
        res.json({ message: `Estado actualizado a "${estado}".` });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error PUT /:id/pedidos/:idEnvio/estado:', err);
        res.status(500).json({ message: 'Error interno del servidor.' });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/corregir-estados', authMiddleware, async (req, res) => {
    try {
        console.log('🔄 Corrigiendo estados de transportistas...');
        console.log('🏢 Empresa del usuario:', req.user.empresa_id);
        
        const [result] = await pool.query(
            `UPDATE transportistas t
             SET t.estado = 'Libre'
             WHERE t.estado = 'Ocupado'
             AND t.empresa_id = ?  -- ✅ NUEVO: Filtro por empresa
             AND NOT EXISTS (
                 SELECT 1 FROM envios e 
                 WHERE e.id_transportista = t.id_transportista 
                 AND e.estado IN ('Pendiente', 'ACEPTADO', 'EN CAMINO')
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
router.get('/debug/info', authMiddleware, async (req, res) => { 
    try {
        console.log('🔍 Debug: Obteniendo información del sistema...');
        console.log('🏢 Empresa del usuario:', req.user.empresa_id);
        
        const [transportistas] = await pool.query(`
            SELECT t.*, u.correo 
            FROM transportistas t 
            INNER JOIN usuarios u ON t.id_usuario = u.id_usuario 
            WHERE t.empresa_id = ?  -- ✅ NUEVO: Filtro por empresa
            ORDER BY t.estado, t.id_transportista`,
            [req.user.empresa_id]  
        );
        
        const [pedidos] = await pool.query(`
            SELECT p.*, e.estado, t.nombre as transportista 
            FROM pedidos p 
            LEFT JOIN envios e ON p.id_pedido = e.id_pedido 
            LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista 
            WHERE p.empresa_id = ?  -- ✅ NUEVO: Filtro por empresa
            ORDER BY p.fecha_creacion DESC`,
            [req.user.empresa_id]  
        );
        
        const [estados] = await pool.query(`
            SELECT estado, COUNT(*) as cantidad 
            FROM transportistas 
            WHERE empresa_id = ?  
            GROUP BY estado`,
            [req.user.empresa_id]  
        );

        res.json({
            transportistas: {
                total: transportistas.length,
                por_estado: estados,
                lista: transportistas
            },
            pedidos: {
                total: pedidos.length,
                lista: pedidos
            },
            sistema: {
                timestamp: new Date().toISOString(),
                base_datos: 'transportadora_online',
                empresa_id: req.user.empresa_id  
            }
        });
        
    } catch (error) {
        console.error('❌ Error en debug endpoint:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor: ' + error.message 
        });
    }
});
router.get('/cercanos', async (req, res) => {
  try {
    const { lat, lng, empresa_id, radio = 3 } = req.query;
    
    console.log('🔍 Buscando transportistas cercanos en ubicaciones:', { lat, lng, empresa_id });
    
    const query = `
      SELECT 
        t.id_transportista,
        t.nombre,
        t.telefono,
        t.vehiculo,
        t.estado,
        t.peso_maximo,
        u.latitud,
        u.longitud,
        ROUND(
          (6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(u.latitud)) * 
            COS(RADIANS(u.longitud) - RADIANS(?)) + 
            SIN(RADIANS(?)) * SIN(RADIANS(u.latitud))
          )), 1
        ) AS distancia_km,
        ROUND(
          (6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(u.latitud)) * 
            COS(RADIANS(u.longitud) - RADIANS(?)) + 
            SIN(RADIANS(?)) * SIN(RADIANS(u.latitud))
          )) / 0.5
        ) AS tiempo_minutos
      FROM transportistas t
      INNER JOIN ubicaciones u ON t.id_transportista = u.id_transportista
      WHERE u.id = (
        SELECT id FROM ubicaciones 
        WHERE id_transportista = t.id_transportista 
        ORDER BY fecha DESC 
        LIMIT 1
      )
      AND t.estado = 'Libre'
      AND (6371 * ACOS(
        COS(RADIANS(?)) * COS(RADIANS(u.latitud)) * 
        COS(RADIANS(u.longitud) - RADIANS(?)) + 
        SIN(RADIANS(?)) * SIN(RADIANS(u.latitud))
      )) <= ?
      ORDER BY distancia_km
      LIMIT 10
    `;
    
    const [transportistas] = await pool.query(query, [
      parseFloat(lat), parseFloat(lng), parseFloat(lat),
      parseFloat(lat), parseFloat(lng), parseFloat(lat),
      parseFloat(lat), parseFloat(lng), parseFloat(lat),
      parseFloat(radio)
    ]);
    
    console.log(`Encontrados ${transportistas.length} transportistas cercanos`);
    res.json(transportistas);
    
  } catch (error) {
    console.error('Error buscando transportistas cercanos:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;