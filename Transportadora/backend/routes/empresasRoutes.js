const express = require("express");
const router = express.Router();
const pool = require("../models/database");
const { authMiddleware } = require('../middleware/auth');

router.get("/public/mapa", async (req, res) => {
  try {
    console.log('📍 [PUBLICO] /empresas/public/mapa');
    
    const [empresas] = await pool.execute(`
      SELECT 
        empresa_id,
        nombre_empresa,
        latitud,
        longitud,
        telefono,
        ciudad
      FROM empresas 
      WHERE latitud IS NOT NULL 
      AND longitud IS NOT NULL
      AND latitud != 0 
      AND longitud != 0
      ORDER BY nombre_empresa
    `);
    
    console.log(`✅ ${empresas.length} empresas para mapa`);
    
    const respuesta = empresas.map(emp => ({
      empresa_id: emp.empresa_id,
      nombre_empresa: emp.nombre_empresa || 'Sin nombre',
      latitud: parseFloat(emp.latitud) || 0,
      longitud: parseFloat(emp.longitud) || 0,
      telefono: emp.telefono || '',
      direccion: emp.ciudad || '',
    }));
    
    res.json({
      success: true,
      empresas: respuesta
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener empresas'
    });
  }
});
const validarEmpresa = async (req, res, next) => {
    try {
        const { empresaId } = req.params;
        
        if (parseInt(empresaId) !== req.user.empresa_id) {
            return res.status(403).json({ 
                success: false,
                error: "No tienes permisos para acceder a esta empresa" 
            });
        }
        
        const [empresa] = await pool.query("SELECT empresa_id FROM empresas WHERE empresa_id = ?", [empresaId]);
        
        if (empresa.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "Empresa no encontrada" 
            });
        }
        
        next();
    } catch (error) {
        console.error('❌ Error validando empresa:', error);
        res.status(500).json({ 
            success: false,
            error: "Error validando empresa" 
        });
    }
};


router.get("/activas", async (req, res) => {
  try {
    const [empresas] = await pool.execute(`
      SELECT 
        empresa_id,
        nombre_empresa,
        ruc,
        ciudad
      FROM empresas 
      WHERE nombre_empresa IS NOT NULL 
      AND nombre_empresa != ''
      ORDER BY nombre_empresa ASC
    `);
    
    res.json({
      success: true,
      empresas: empresas
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo empresas activas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la lista de empresas'
    });
  }
});

router.get("/:empresaId", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        
        const [empresa] = await pool.query(
            "SELECT empresa_id, nombre_empresa, correo_electronico, telefono, ciudad, nombre_titular, ruc, fecha, latitud, longitud FROM empresas WHERE empresa_id = ?", 
            [empresaId]
        );
        
        if (empresa.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "Empresa no encontrada" 
            });
        }

        const empresaData = {
            empresa_id: empresa[0].empresa_id,
            nombre_empresa: empresa[0].nombre_empresa,
            correo_electronico: empresa[0].correo_electronico,
            telefono: empresa[0].telefono,
            ciudad: empresa[0].ciudad,
            nombre_titular: empresa[0].nombre_titular,
            ruc: empresa[0].ruc,
            fecha: empresa[0].fecha,
            latitud: empresa[0].latitud,
            longitud: empresa[0].longitud
        };

        res.json({
            success: true,
            empresa: empresaData
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo empresa:', error);
        res.status(500).json({ 
            success: false,
            error: "Error obteniendo empresa" 
        });
    }
});
router.get("/:empresaId/envios", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { fecha } = req.query;
        
        let query = `
            SELECT 
                e.id_envio,
                p.id_pedido,
                p.descripcion,
                p.direccion_origen,
                p.direccion_destino,
                p.fecha_envio,
                p.tipo_carga,
                p.costo,
                CASE 
                    WHEN e.estado IS NULL THEN 'PENDIENTE'
                    WHEN e.estado = 'Pendiente' THEN 'PENDIENTE'
                    ELSE e.estado 
                END AS estado,
                t.nombre AS transportista_nombre,
                t.telefono AS transportista_telefono,
                t.vehiculo,
                t.estado AS estado_transportista,
                p.fecha_creacion,
                (SELECT MAX(fecha) FROM ubicaciones u WHERE u.id_pedido = p.id_pedido) as ultima_ubicacion
            FROM envios e
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista
            WHERE p.empresa_id = ?
        `;

        const params = [empresaId];
        
        if (fecha) {
            query += ` AND DATE(p.fecha_envio) = ?`;
            params.push(fecha);
        }

        query += ` ORDER BY e.id_envio DESC`;
        
        const [envios] = await pool.query(query, params);
        
        res.json({
            success: true,
            envios: envios,
            total: envios.length
        });
        
    } catch (error) {
        console.error("❌ Error obteniendo envíos:", error);
        res.status(500).json({ 
            success: false,
            error: "Error interno del servidor al obtener envíos"
        });
    }
});
router.get("/:empresaId/transportistas", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { simple = 'false' } = req.query; 
        
        if (simple === 'true') {
            const querySimple = `
                SELECT 
                    t.id_transportista,
                    t.nombre,
                    t.telefono,
                    t.vehiculo,
                    t.estado,
                    t.esta_en_base
                FROM transportistas t
                WHERE t.empresa_id = ?
                ORDER BY t.nombre
            `;
            
            const [transportistas] = await pool.query(querySimple, [empresaId]);
            
            return res.json({
                success: true,
                transportistas: transportistas,
                total: transportistas.length
            });
        }
        
        const query = `
            -- Primero obtener la última ubicación por transportista
            WITH ultimas_ubicaciones AS (
                SELECT 
                    u.id_transportista,
                    MAX(u.fecha) as ultima_fecha
                FROM ubicaciones u
                GROUP BY u.id_transportista
            )
            
            SELECT 
                t.id_transportista,
                t.nombre,
                t.telefono,
                t.cedula,
                t.licencia,
                t.vehiculo,
                t.peso_maximo,
                t.estado,
                t.esta_en_base,
                -- Solo traer datos si está en un envío activo
                CASE 
                    WHEN e.estado IN ('EN CAMINO', 'ACEPTADO') THEN e.id_envio
                    ELSE NULL
                END as id_envio,
                CASE 
                    WHEN e.estado IN ('EN CAMINO', 'ACEPTADO') THEN e.estado
                    ELSE NULL
                END as estado_envio,
                CASE 
                    WHEN e.estado IN ('EN CAMINO', 'ACEPTADO') THEN p.direccion_origen
                    ELSE NULL
                END as direccion_origen,
                CASE 
                    WHEN e.estado IN ('EN CAMINO', 'ACEPTADO') THEN p.direccion_destino
                    ELSE NULL
                END as direccion_destino,
                u.latitud,
                u.longitud,
                u.fecha as fecha_ubicacion
            FROM transportistas t
            LEFT JOIN envios e ON t.id_transportista = e.id_transportista 
                AND e.estado IN ('EN CAMINO', 'ACEPTADO')
            LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
            LEFT JOIN ultimas_ubicaciones uu ON t.id_transportista = uu.id_transportista
            LEFT JOIN ubicaciones u ON t.id_transportista = u.id_transportista 
                AND u.fecha = uu.ultima_fecha
            WHERE t.empresa_id = ?
            ORDER BY 
                -- Orden simple, el CASE complejo ralentiza
                t.estado DESC,  -- 'Libre' primero
                t.nombre
        `;
        
        const [transportistas] = await pool.query(query, [empresaId]);
        
        console.log(`🏢 Empresa ${empresaId}: ${transportistas.length} transportistas encontrados`);
        
        res.json({
            success: true,
            transportistas: transportistas,
            total: transportistas.length
        });
        
    } catch (error) {
        console.error("Error obteniendo transportistas:", error);
        res.status(500).json({ 
            success: false,
            error: "Error obteniendo transportistas: " + error.message
        });
    }
});
router.get("/:empresaId/metricas", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        
        const query = `
            SELECT 
                COUNT(*) AS total_viajes,
                COALESCE(SUM(p.costo), 0) AS costo_total,
                SUM(CASE WHEN e.estado = 'Pendiente' OR e.estado IS NULL THEN 1 ELSE 0 END) AS viajes_pendientes,
                SUM(CASE WHEN e.estado = 'ACEPTADO' OR e.estado = 'EN CAMINO' THEN 1 ELSE 0 END) AS viajes_activos,
                SUM(CASE WHEN e.estado = 'ENTREGADO' THEN 1 ELSE 0 END) AS viajes_completados
            FROM pedidos p
            LEFT JOIN envios e ON p.id_pedido = e.id_pedido
            WHERE p.empresa_id = ?
        `;
        
        const [metricas] = await pool.query(query, [empresaId]);
        
        res.json({
            success: true,
            metricas: metricas[0]
        });
        
    } catch (error) {
        console.error("❌ Error obteniendo métricas:", error);
        res.status(500).json({ 
            success: false,
            error: "Error obteniendo métricas" 
        });
    }
});
router.get("/:empresaId/reportes", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { fecha_inicio, fecha_fin, tipo_reporte } = req.query;

        let query = `
            SELECT 
                e.id_envio,
                p.id_pedido,
                p.descripcion,
                p.direccion_origen,
                p.direccion_destino,
                p.fecha_envio,
                p.tipo_carga,
                p.costo,
                p.fecha_creacion,
                CASE 
                    WHEN e.estado IS NULL THEN 'PENDIENTE'
                    WHEN e.estado = 'Pendiente' THEN 'PENDIENTE'
                    ELSE e.estado 
                END AS estado,
                t.id_transportista,
                t.nombre AS transportista_nombre,
                t.telefono AS transportista_telefono,
                t.vehiculo,
                t.estado AS estado_transportista
            FROM envios e
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            LEFT JOIN transportistas t ON e.id_transportista = t.id_transportista
            WHERE p.empresa_id = ?
        `;

        const params = [empresaId];
        
        if (fecha_inicio) {
            query += ` AND p.fecha_envio >= ?`;
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ` AND p.fecha_envio <= ?`;
            params.push(fecha_fin);
        }

        if (tipo_reporte === 'ingresos') {
            query += ` AND e.estado = 'ENTREGADO'`;
        }

        query += ` ORDER BY e.id_envio DESC`;
        
        const [viajes] = await pool.query(query, params);

        const totalViajes = viajes.length;
        const viajesEntregados = viajes.filter(v => v.estado === 'ENTREGADO').length;
        const viajesPendientes = viajes.filter(v => v.estado === 'PENDIENTE').length;
        const viajesEnCurso = viajes.filter(v => v.estado === 'EN CAMINO' || v.estado === 'ACEPTADO').length;
        
        const ingresosTotales = viajes
            .filter(v => v.estado === 'ENTREGADO')
            .reduce((sum, v) => sum + (parseFloat(v.costo) || 0), 0);
        
        const ingresosPendientes = viajes
            .filter(v => v.estado === 'PENDIENTE')
            .reduce((sum, v) => sum + (parseFloat(v.costo) || 0), 0);

        const transportistasStats = {};
        viajes.forEach(viaje => {
            if (viaje.id_transportista && viaje.transportista_nombre) {
                if (!transportistasStats[viaje.id_transportista]) {
                    transportistasStats[viaje.id_transportista] = {
                        nombre: viaje.transportista_nombre,
                        total_viajes: 0,
                        viajes_entregados: 0,
                        ingresos_generados: 0
                    };
                }
                
                transportistasStats[viaje.id_transportista].total_viajes++;
                if (viaje.estado === 'ENTREGADO') {
                    transportistasStats[viaje.id_transportista].viajes_entregados++;
                    transportistasStats[viaje.id_transportista].ingresos_generados += parseFloat(viaje.costo) || 0;
                }
            }
        });

        const reporte = {
            viajes: {
                total: totalViajes,
                entregados: viajesEntregados,
                pendientes: viajesPendientes,
                en_curso: viajesEnCurso,
                tasa_exito: totalViajes > 0 ? (viajesEntregados / totalViajes * 100).toFixed(1) : 0
            },
            ingresos: {
                total: ingresosTotales,
                pendientes: ingresosPendientes,
                promedio_por_viaje: viajesEntregados > 0 ? (ingresosTotales / viajesEntregados) : 0
            },
            transportistas: Object.values(transportistasStats),
            viajes_detalle: viajes
        };
        
        res.json({
            success: true,
            reportes: reporte
        });
        
    } catch (error) {
        console.error("❌ Error generando reportes:", error);
        res.status(500).json({ 
            success: false,
            error: "Error generando reportes"
        });
    }
});

router.get("/:empresaId/envios/:idEnvio/gastos-detalle", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId, idEnvio } = req.params;
        
        const [gastos] = await pool.query(`
            SELECT 
                g.id_gasto,
                g.descripcion,
                g.monto,
                g.fecha_gasto,
                t.nombre as nombre_transportista,
                t.id_transportista
            FROM gastos_envio g
            LEFT JOIN transportistas t ON g.id_transportista = t.id_transportista
            LEFT JOIN envios e ON g.id_envio = e.id_envio
            LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE g.id_envio = ?
            AND p.empresa_id = ?
            ORDER BY g.fecha_gasto DESC
        `, [idEnvio, empresaId]);
        
        res.json({
            success: true,
            gastos: gastos
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo detalles de gastos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener los detalles de gastos'
        });
    }
});

router.post("/:empresaId/gastos-envios", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { ids_envios } = req.body;
        
        if (!ids_envios || !Array.isArray(ids_envios)) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere un array de IDs de envíos'
            });
        }
        
        if (ids_envios.length === 0) {
            return res.json({
                success: true,
                gastos_por_envio: {}
            });
        }
        
        const placeholders = ids_envios.map(() => '?').join(',');
        const queryParams = [...ids_envios, empresaId];
        
        const [gastos] = await pool.query(`
            SELECT 
                g.id_envio, 
                SUM(g.monto) as total_gastos
            FROM gastos_envio g
            LEFT JOIN envios e ON g.id_envio = e.id_envio
            LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE g.id_envio IN (${placeholders})
            AND p.empresa_id = ?
            GROUP BY g.id_envio
        `, queryParams);
        
        const gastosPorEnvio = {};
        gastos.forEach(gasto => {
            gastosPorEnvio[gasto.id_envio] = parseFloat(gasto.total_gastos) || 0;
        });
        
        res.json({
            success: true,
            gastos_por_envio: gastosPorEnvio
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo gastos por envíos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener los gastos'
        });
    }
});

router.post("/:empresaId/gastos-detallados", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { ids_envios } = req.body;
        
        if (!ids_envios || !Array.isArray(ids_envios) || ids_envios.length === 0) {
            return res.json({
                success: true,
                gastos_detallados: {}
            });
        }
        
        const placeholders = ids_envios.map(() => '?').join(',');
        const queryParams = [...ids_envios, empresaId];
        
        const [gastos] = await pool.query(`
            SELECT 
                g.id_gasto,
                g.id_envio,
                g.descripcion,
                g.monto,
                g.fecha_gasto,
                t.nombre as nombre_transportista,
                t.id_transportista
            FROM gastos_envio g
            LEFT JOIN transportistas t ON g.id_transportista = t.id_transportista
            LEFT JOIN envios e ON g.id_envio = e.id_envio
            LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE g.id_envio IN (${placeholders})
            AND p.empresa_id = ?
            ORDER BY g.id_envio, g.fecha_gasto DESC
        `, queryParams);
        
        const gastosPorEnvio = {};
        gastos.forEach(gasto => {
            if (!gastosPorEnvio[gasto.id_envio]) {
                gastosPorEnvio[gasto.id_envio] = [];
            }
            gastosPorEnvio[gasto.id_envio].push({
                id_gasto: gasto.id_gasto,
                descripcion: gasto.descripcion,
                monto: parseFloat(gasto.monto) || 0,
                fecha_gasto: gasto.fecha_gasto,
                nombre_transportista: gasto.nombre_transportista,
                id_transportista: gasto.id_transportista
            });
        });
        
        res.json({
            success: true,
            gastos_detallados: gastosPorEnvio
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo gastos detallados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener los gastos detallados'
        });
    }
});

router.get("/:empresaId/transportistas-en-movimiento", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        
        const query = `
            SELECT DISTINCT
                t.id_transportista,
                t.nombre,
                t.telefono,
                t.vehiculo,
                t.estado,
                e.id_envio,
                e.estado as estado_envio,
                p.direccion_origen,
                p.direccion_destino,
                p.descripcion,
                u.latitud,
                u.longitud,
                u.fecha as fecha_actualizacion
            FROM transportistas t
            INNER JOIN envios e ON t.id_transportista = e.id_transportista 
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            LEFT JOIN ubicaciones u ON (
                t.id_transportista = u.id_transportista 
                AND u.fecha = (
                    SELECT MAX(fecha) 
                    FROM ubicaciones 
                    WHERE id_transportista = t.id_transportista
                    AND empresa_id = t.empresa_id
                )
            )
            WHERE t.empresa_id = ?
              AND e.estado IN ('EN CAMINO', 'ACEPTADO')
              AND u.latitud IS NOT NULL
              AND u.longitud IS NOT NULL
            ORDER BY u.fecha DESC
        `;
        
        const [transportistas] = await pool.query(query, [empresaId]);
        
        res.json({
            success: true,
            transportistas: transportistas,
            total: transportistas.length
        });
        
    } catch (error) {
        console.error("❌ Error obteniendo transportistas en movimiento:", error);
        res.status(500).json({ 
            success: false,
            error: "Error obteniendo transportistas en movimiento" 
        });
    }
});
router.get("/:empresaId/transportistas-disponibles", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        
        const query = `
            SELECT 
                t.id_transportista,
                t.nombre,
                t.telefono,
                t.cedula,
                t.licencia,
                t.vehiculo,
                t.peso_maximo,
                t.estado,
                t.esta_en_base
            FROM transportistas t
            WHERE t.empresa_id = ?
              AND t.estado = 'Libre'
            ORDER BY t.nombre
        `;
        
        const [transportistas] = await pool.query(query, [empresaId]);
        
        console.log(`🏢 Empresa ${empresaId}: ${transportistas.length} transportistas disponibles`);
        
        res.json({
            success: true,
            transportistas: transportistas,
            total: transportistas.length
        });
        
    } catch (error) {
        console.error("❌ Error obteniendo transportistas disponibles:", error);
        res.status(500).json({ 
            success: false,
            error: "Error obteniendo transportistas disponibles: " + error.message
        });
    }
});
router.get('/:empresaId/recorridos/:idEnvio', authMiddleware, validarEmpresa, async (req, res) => {
  try {
    const { empresaId, idEnvio } = req.params;
    
    const [recorrido] = await pool.query(`
      SELECT 
        ul.latitud,
        ul.longitud,
        ul.fecha_actualizacion,
        ul.velocidad,
        ul.exactitud,
        ul.tipo_ubicacion
      FROM ubicaciones_log ul
      INNER JOIN envios e ON ul.envio_id = e.id_envio
      INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
      WHERE e.id_envio = ? AND p.empresa_id = ?
      ORDER BY ul.fecha_actualizacion ASC
    `, [idEnvio, empresaId]);

    res.json({
      success: true,
      recorrido: recorrido,
      totalPuntos: recorrido.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo recorrido:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo el recorrido'
    });
  }
});

router.post("/:empresaId/ubicaciones/actualizar", authMiddleware, validarEmpresa, async (req, res) => {
  try {
    const { empresaId } = req.params;
    const {
      id_transportista,
      id_envio,
      latitud,
      longitud,
      etapa_viaje = 'en_viaje'
    } = req.body;

    const [verificacion] = await pool.execute(
      'SELECT id_transportista FROM transportistas WHERE id_transportista = ? AND empresa_id = ?',
      [id_transportista, empresaId]
    );

    if (verificacion.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Transportista no pertenece a esta empresa'
      });
    }

    const [envioData] = await pool.execute(
      'SELECT id_pedido FROM envios WHERE id_envio = ?',
      [id_envio]
    );

    if (envioData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Envío no encontrado'
      });
    }

    const id_pedido = envioData[0].id_pedido;

    const query = `
      INSERT INTO ubicaciones 
        (empresa_id, id_transportista, id_pedido, latitud, longitud, fecha)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;

    await pool.execute(query, [
      empresaId,
      id_transportista,
      id_pedido,
      latitud,
      longitud
    ]);

    if (req.app.get('io')) {
      req.app.get('io').to(`empresa_${empresaId}`).emit('ubicacion-actualizada', {
        transportistaId: id_transportista,
        envioId: id_envio,
        latitud: parseFloat(latitud),
        longitud: parseFloat(longitud),
        etapa: etapa_viaje,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Ubicación actualizada correctamente'
    });

  } catch (error) {
    console.error('❌ Error guardando ubicación:', error);
    res.status(500).json({
      success: false,
      error: 'Error guardando ubicación'
    });
  }
});
router.get('/:empresaId/ubicacion', authMiddleware, validarEmpresa, async (req, res) => {
  try {
    const { empresaId } = req.params;
    console.log('🔍 Consultando ubicación empresa ID:', empresaId);
    
    const [empresa] = await pool.query(
      "SELECT empresa_id, nombre_empresa, latitud, longitud FROM empresas WHERE empresa_id = ?", 
      [empresaId]
    );
    
    if (empresa.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Empresa no encontrada" 
      });
    }

    console.log('📊 Empresa encontrada:', {
      id: empresa[0].empresa_id,
      nombre: empresa[0].nombre_empresa,
      lat: empresa[0].latitud,
      lng: empresa[0].longitud
    });

    res.json({
      success: true,
      empresa: {
        empresa_id: empresa[0].empresa_id,
        nombre_empresa: empresa[0].nombre_empresa,
        latitud: empresa[0].latitud,
        longitud: empresa[0].longitud
      }
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo ubicación empresa:', error);
    res.status(500).json({ 
      success: false,
      error: "Error obteniendo ubicación empresa" 
    });
  }
});
router.get('/todas', async (req, res) => {
    try {
        console.log('🏢 Solicitando todas las empresas...');
        
        const query = `
            SELECT 
                empresa_id,
                nombre_empresa,
                latitud,
                longitud,
                telefono,
                correo_electronico,
                ciudad
            FROM empresas 
            WHERE latitud IS NOT NULL 
            AND longitud IS NOT NULL
            AND latitud != 0 
            AND longitud != 0
            ORDER BY nombre_empresa ASC
        `;
        
        const [empresas] = await db.query(query);
        
        console.log(`✅ ${empresas.length} empresas encontradas`);
        const respuesta = empresas.map(emp => {
            const latitud = parseFloat(emp.latitud);
            const longitud = parseFloat(emp.longitud);
            
            return {
                empresa_id: emp.empresa_id,
                nombre_empresa: emp.nombre_empresa || 'Sin nombre',
                latitud: isNaN(latitud) ? 0 : latitud,
                longitud: isNaN(longitud) ? 0 : longitud,
                telefono: emp.telefono || '',
                direccion: emp.ciudad || '',
            };
        });
        
        res.json({
            success: true,
            empresas: respuesta
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener empresas'
        });
    }
});
router.get("/:empresaId/transportistas/:transportistaId/historico-ubicaciones", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId, transportistaId } = req.params;
        const { limit = 100 } = req.query;
        
        console.log(`📊 Obteniendo histórico de ubicaciones para transportista ${transportistaId}`);
        
        const [ubicaciones] = await pool.query(`
            SELECT 
                u.latitud,
                u.longitud,
                u.fecha,
                e.id_envio,
                p.direccion_destino,
                p.direccion_origen
            FROM ubicaciones u
            INNER JOIN envios e ON u.id_pedido = e.id_pedido
            INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
            INNER JOIN transportistas t ON u.id_transportista = t.id_transportista
            WHERE u.id_transportista = ?
            AND p.empresa_id = ?
            ORDER BY u.fecha DESC
            LIMIT ?
        `, [transportistaId, empresaId, parseInt(limit)]);
        const ubicacionesOrdenadas = [...ubicaciones].reverse();
        
        res.json({
            success: true,
            ubicaciones: ubicacionesOrdenadas,
            total: ubicaciones.length,
            transportista_id: transportistaId
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo histórico de ubicaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo histórico de ubicaciones'
        });
    }
});

router.post('/:empresaId/envios/:idEnvio/gastos', authMiddleware, async (req, res) => {
  try {
    const { empresaId, idEnvio } = req.params;
    const { descripcion, monto, id_transportista } = req.body;
    const userId = req.user.id_usuario;
    
    console.log(`💰 Registrando gasto para envío ${idEnvio} de transportista ${id_transportista}`);

    if (!descripcion || !monto || monto <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Descripción y monto válido son requeridos'
      });
    }

    const [transportista] = await pool.query(
      'SELECT id_transportista FROM transportistas WHERE id_transportista = ? AND empresa_id = ?',
      [id_transportista, empresaId]
    );
    
    if (transportista.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Transportista no válido o no pertenece a esta empresa'
      });
    }

    const [envio] = await pool.query(
      `SELECT e.id_envio, e.id_transportista 
       FROM envios e
       INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
       WHERE e.id_envio = ? 
       AND e.id_transportista = ? 
       AND p.empresa_id = ?`,
      [idEnvio, id_transportista, empresaId]
    );

    if (envio.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Envío no encontrado o no asignado a este transportista'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO gastos_envio 
       (empresa_id, id_envio, id_transportista, descripcion, monto, fecha_gasto) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [empresaId, idEnvio, id_transportista, descripcion, monto]
    );

    console.log(`✅ Gasto registrado exitosamente: ID ${result.insertId}`);

    res.json({
      success: true,
      message: 'Gasto registrado exitosamente',
      gasto_id: result.insertId
    });

  } catch (error) {
    console.error('❌ Error registrando gasto:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al registrar gasto'
    });
  }
});

router.put('/:empresaId/envios/:idEnvio/estado', authMiddleware, async (req, res) => {
  try {
    const { empresaId, idEnvio } = req.params;
    const { estado } = req.body;
    const userId = req.user.id_usuario;
    
    console.log(`🔄 Actualizando estado del envío ${idEnvio} a "${estado}"`);
    const [envio] = await pool.query(
      `SELECT e.id_envio, e.id_transportista 
       FROM envios e
       INNER JOIN pedidos p ON e.id_pedido = p.id_pedido
       WHERE e.id_envio = ? 
       AND p.empresa_id = ?`,
      [idEnvio, empresaId]
    );

    if (envio.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Envío no encontrado'
      });
    }

    await pool.query(
      'UPDATE envios SET estado = ?, fecha_entrega = NOW() WHERE id_envio = ?',
      [estado, idEnvio]
    );

    if (estado === 'ENTREGADO') {
      const transportistaId = envio[0].id_transportista;
      await pool.query(
        'UPDATE transportistas SET estado = ? WHERE id_transportista = ?',
        ['Libre', transportistaId]
      );
      console.log(`✅ Transportista ${transportistaId} marcado como Libre`);
    }

    console.log(`✅ Estado del envío ${idEnvio} actualizado a "${estado}"`);

    res.json({
      success: true,
      message: `Envío marcado como ${estado}`
    });

  } catch (error) {
    console.error('❌ Error actualizando estado del envío:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al actualizar estado'
    });
  }
});

router.post('/empresas/:empresaId/envios/:envioId/gastos', async (req, res) => {
  try {
    const { empresaId, envioId } = req.params;
    const { descripcion, monto, id_transportista, fecha_gasto } = req.body;
    const envio = await db.query(
      'SELECT * FROM envios WHERE id_envio = ? AND empresa_id = ?',
      [envioId, empresaId]
    );
    
    if (envio.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Envío no encontrado o no pertenece a esta empresa'
      });
    }
    
    const result = await db.query(
      `INSERT INTO gastos_envio 
       (empresa_id, id_envio, id_transportista, descripcion, monto, fecha_gasto)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [empresaId, envioId, id_transportista, descripcion, monto, 
       fecha_gasto || new Date()]
    );
    
    res.json({
      success: true,
      message: 'Gasto registrado exitosamente',
      gastoId: result.insertId
    });
    
  } catch (error) {
    console.error('Error registrando gasto:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

router.put('/empresas/:empresaId/envios/:envioId/estado', async (req, res) => {
  try {
    const { empresaId, envioId } = req.params;
    const { estado, fecha_entrega } = req.body;
    const envio = await db.query(
      'SELECT * FROM envios WHERE id_envio = ? AND empresa_id = ?',
      [envioId, empresaId]
    );
    
    if (envio.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Envío no encontrado'
      });
    }
    
    await db.query(
      `UPDATE envios 
       SET estado = ?, fecha_entrega = ?
       WHERE id_envio = ? AND empresa_id = ?`,
      [estado, fecha_entrega || new Date(), envioId, empresaId]
    );
    
    res.json({
      success: true,
      message: `Estado del envío actualizado a ${estado}`
    });
    
  } catch (error) {
    console.error('Error actualizando estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});
router.get('/transportistas/:transportistaId/viajes-sin-gastos', async (req, res) => {
  try {
    const { transportistaId } = req.params;
    const viajesEntregados = await db.query(`
      SELECT DISTINCT
        e.id_envio,
        e.id_pedido,
        e.costo,
        e.fecha_envio,
        e.fecha_entrega,
        e.estado,
        ep.direccion_origen,
        ep.direccion_destino,
        ep.descripcion,
        e.empresa_id
      FROM envios e
      LEFT JOIN envios_pedidos ep ON e.id_pedido = ep.id_pedido
      WHERE e.id_transportista = ?
        AND e.estado = 'ENTREGADO'
        AND e.fecha_entrega IS NOT NULL
        AND DATE(e.fecha_entrega) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      ORDER BY e.fecha_entrega DESC
    `, [transportistaId]);
    
    const viajesSinGastos = [];
    
    for (const viaje of viajesEntregados) {
      const gastos = await db.query(`
        SELECT COUNT(*) as cantidad 
        FROM gastos_envio 
        WHERE id_envio = ? AND id_transportista = ?
      `, [viaje.id_envio, transportistaId]);
      
      if (gastos[0].cantidad === 0) {
        viajesSinGastos.push(viaje);
      }
    }
    
    res.json({
      success: true,
      viajes: viajesSinGastos,
      total: viajesSinGastos.length,
      message: viajesSinGastos.length > 0 
        ? `Tienes ${viajesSinGastos.length} viajes sin gastos registrados` 
        : 'Todos tus viajes tienen gastos registrados'
    });
    
  } catch (error) {
    console.error('Error obteniendo viajes sin gastos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

router.get("/:empresaId/gastos-fijos", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { mes, año } = req.query;
        
        let query = `
            SELECT 
                id_gasto_fijo,
                descripcion,
                categoria,
                monto,
                fecha,
                periodicidad,
                fecha_registro
            FROM gastos_fijos_empresa
            WHERE empresa_id = ?
        `;
        
        const params = [empresaId];
        
        if (mes && año) {
            query += ` AND MONTH(fecha) = ? AND YEAR(fecha) = ?`;
            params.push(mes, año);
        }
        
        query += ` ORDER BY fecha DESC, id_gasto_fijo DESC`;
        
        const [gastos] = await pool.query(query, params);
        
        const totalGastos = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
        
        res.json({
            success: true,
            gastos: gastos,
            total_gastos_fijos: totalGastos,
            cantidad: gastos.length
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo gastos fijos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener gastos fijos: ' + error.message
        });
    }
});

router.post("/:empresaId/gastos-fijos", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { descripcion, categoria, monto, fecha, periodicidad } = req.body;
        
        if (!descripcion || !monto || !fecha) {
            return res.status(400).json({
                success: false,
                message: 'Descripción, monto y fecha son requeridos'
            });
        }
        
        const [result] = await pool.query(
            `INSERT INTO gastos_fijos_empresa 
             (empresa_id, descripcion, categoria, monto, fecha, periodicidad)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [empresaId, descripcion, categoria || 'otros', monto, fecha, periodicidad || 'mensual']
        );
        
        res.json({
            success: true,
            message: 'Gasto fijo registrado correctamente',
            id_gasto_fijo: result.insertId
        });
        
    } catch (error) {
        console.error('❌ Error registrando gasto fijo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar gasto fijo: ' + error.message
        });
    }
});

router.put("/:empresaId/gastos-fijos/:idGasto", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId, idGasto } = req.params;
        const { descripcion, categoria, monto, fecha, periodicidad } = req.body;
        
        const [result] = await pool.query(
            `UPDATE gastos_fijos_empresa 
             SET descripcion = ?, categoria = ?, monto = ?, fecha = ?, periodicidad = ?
             WHERE id_gasto_fijo = ? AND empresa_id = ?`,
            [descripcion, categoria, monto, fecha, periodicidad, idGasto, empresaId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Gasto fijo no encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Gasto fijo actualizado correctamente'
        });
        
    } catch (error) {
        console.error('❌ Error actualizando gasto fijo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar gasto fijo: ' + error.message
        });
    }
});

router.delete("/:empresaId/gastos-fijos/:idGasto", authMiddleware, validarEmpresa, async (req, res) => {
    try {
        const { empresaId, idGasto } = req.params;
        
        const [result] = await pool.query(
            'DELETE FROM gastos_fijos_empresa WHERE id_gasto_fijo = ? AND empresa_id = ?',
            [idGasto, empresaId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Gasto fijo no encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Gasto fijo eliminado correctamente'
        });
        
    } catch (error) {
        console.error('❌ Error eliminando gasto fijo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar gasto fijo: ' + error.message
        });
    }
});
module.exports = router;