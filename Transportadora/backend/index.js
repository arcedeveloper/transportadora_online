require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express'); 
const swaggerDocument = require('./swagger.json'); 
const pool = require('./models/database');
const jwt = require('jsonwebtoken');

const { setupWebSocket, getIO } = require('./websocket');

const app = express();
const LOG_LEVEL = {
    ERROR: 0,
    INFO: 1,
    DEBUG: 2
};

const CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; 

function logInfo(message) {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) {
        console.log(`📌 ${message}`);
    }
}

function logError(message, error = null) {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) {
        console.error(`❌ ${message}`);
        if (error) console.error(error);
    }
}
const { authMiddleware, checkRole } = require('./middleware/auth');
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
          const allowedOrigins = [
    'http://127.0.0.1:5500',
    'http://localhost:5500', 
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://10.0.2.2:3000',
    'https://arcedevolver.github.io',  
    'https://transportadoraonline-production.up.railway.app'  
]
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logInfo(`Origen permitido: ${origin}`);
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization', 'X-Requested-With', 'Origin', 'Accept', 'Cookie']
}));

app.options('*', cors());
app.use(express.json());
app.use(cookieParser());

const checkDatabaseConnection = async () => {
    try {
        await pool.query('SELECT 1 + 1 AS solution');
        logInfo('Conexión a la base de datos exitosa.');
    } catch (err) {
        logError('Error al conectar con la base de datos:', err);
    }
};

const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chats', chatRoutes);

app.get('/api/admin/test', authMiddleware, checkRole('Administrador'), (req, res) => {
    res.json({
        success: true,
        message: 'Conexión con panel de administración exitosa',
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/admin/dashboard', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        
        const [usuarios] = await pool.query('SELECT COUNT(*) as total FROM usuarios WHERE empresa_id = ?', [empresaId]);
        const [transportistas] = await pool.query('SELECT COUNT(*) as total FROM transportistas WHERE empresa_id = ?', [empresaId]);
        const [pedidos] = await pool.query('SELECT COUNT(*) as total FROM pedidos WHERE empresa_id = ?', [empresaId]);
        
        const [pedidosEntregados] = await pool.query(`
            SELECT COUNT(*) as total 
            FROM envios e 
            JOIN pedidos p ON e.id_pedido = p.id_pedido 
            WHERE e.estado = "ENTREGADO" AND p.empresa_id = ?
        `, [empresaId]);
        
        const [pedidosPendientes] = await pool.query(`
            SELECT COUNT(*) as total 
            FROM envios e 
            JOIN pedidos p ON e.id_pedido = p.id_pedido 
            WHERE e.estado = "Pendiente" AND p.empresa_id = ?
        `, [empresaId]);
        
        const [transportistasLibres] = await pool.query('SELECT COUNT(*) as total FROM transportistas WHERE estado = "Libre" AND empresa_id = ?', [empresaId]);
        const [transportistasOcupados] = await pool.query('SELECT COUNT(*) as total FROM transportistas WHERE estado = "ocupado" AND empresa_id = ?', [empresaId]);
        const [ingresos] = await pool.query('SELECT COALESCE(SUM(costo), 0) as total FROM pedidos WHERE empresa_id = ?', [empresaId]);

        res.json({
            success: true,
            stats: {
                totalUsuarios: usuarios[0].total,
                totalTransportistas: transportistas[0].total,
                totalPedidos: pedidos[0].total,
                pedidosPendientes: pedidosPendientes[0].total,
                pedidosEntregados: pedidosEntregados[0].total,
                transportistasLibres: transportistasLibres[0].total,
                transportistasOcupados: transportistasOcupados[0].total,
                ingresosTotales: parseFloat(ingresos[0].total) || 0,
                empresa_id: empresaId
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logError('Error en dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar el dashboard',
            error: error.message
        });
    }
});

app.get('/api/admin/usuarios', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { rol, busqueda } = req.query;
        const empresaId = req.user.empresa_id;
        
        let query = `
            SELECT 
                u.id_usuario, 
                u.correo, 
                u.activo, 
                u.id_rol,
                r.nombre as rol,
                CASE 
                    WHEN r.nombre = 'Transportista' THEN t.nombre
                    WHEN r.nombre = 'Cliente' THEN 'Cliente'
                    ELSE 'Administrador'
                END as nombre_completo,
                CASE 
                    WHEN r.nombre = 'Transportista' THEN t.telefono
                    ELSE 'No disponible'
                END as telefono
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id_rol 
            LEFT JOIN transportistas t ON u.id_usuario = t.id_usuario
            WHERE u.empresa_id = ?
        `;
        const params = [empresaId];

        if (rol) {
            query += ' AND r.nombre = ?';
            params.push(rol);
        }

        if (busqueda) {
            query += ' AND (u.correo LIKE ? OR r.nombre LIKE ? OR t.nombre LIKE ?)';
            params.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
        }

        query += ' ORDER BY u.id_usuario DESC';

        const [usuarios] = await pool.query(query, params);

        res.json({
            success: true,
            usuarios: usuarios,
            total: usuarios.length
        });

    } catch (error) {
        logError('Error cargando usuarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar usuarios'
        });
    }
});

app.post('/api/admin/usuarios/:id/bloquear', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresa_id;
        
        const [userCheck] = await pool.query('SELECT id_usuario FROM usuarios WHERE id_usuario = ? AND empresa_id = ?', [id, empresaId]);
        
        if (userCheck.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para bloquear este usuario'
            });
        }
        
        await pool.query('UPDATE usuarios SET activo = 0 WHERE id_usuario = ?', [id]);
        
        res.json({
            success: true,
            message: 'Usuario bloqueado exitosamente'
        });

    } catch (error) {
        logError('Error bloqueando usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al bloquear usuario'
        });
    }
});

app.post('/api/admin/usuarios/:id/activar', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresa_id;
        
        const [userCheck] = await pool.query('SELECT id_usuario FROM usuarios WHERE id_usuario = ? AND empresa_id = ?', [id, empresaId]);
        
        if (userCheck.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para activar este usuario'
            });
        }
        
        await pool.query('UPDATE usuarios SET activo = 1 WHERE id_usuario = ?', [id]);
        
        res.json({
            success: true,
            message: 'Usuario activado exitosamente'
        });

    } catch (error) {
        logError('Error activando usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al activar usuario'
        });
    }
});

app.get('/api/admin/transportistas', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        
        const [transportistas] = await pool.query(`
            SELECT 
                t.id_transportista, 
                t.nombre, 
                t.cedula, 
                t.licencia, 
                t.vehiculo, 
                t.peso_maximo,
                t.telefono, 
                t.estado,
                u.correo,
                COUNT(e.id_envio) as total_envios
            FROM transportistas t
            LEFT JOIN usuarios u ON t.id_usuario = u.id_usuario
            LEFT JOIN envios e ON t.id_transportista = e.id_transportista
            WHERE t.empresa_id = ?
            GROUP BY t.id_transportista
            ORDER BY t.id_transportista DESC
        `, [empresaId]);

        res.json({
            success: true,
            transportistas: transportistas,
            total: transportistas.length
        });

    } catch (error) {
        logError('Error cargando transportistas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar transportistas'
        });
    }
});
app.get('/api/admin/transportistas/:id', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresa_id;
        
        const [transportistas] = await pool.query(`
            SELECT 
                t.id_transportista, 
                t.nombre, 
                t.cedula, 
                t.licencia, 
                t.vehiculo, 
                t.peso_maximo,
                t.telefono, 
                t.estado,
                u.correo
            FROM transportistas t
            LEFT JOIN usuarios u ON t.id_usuario = u.id_usuario
            WHERE t.id_transportista = ? AND t.empresa_id = ?
        `, [id, empresaId]);

        if (transportistas.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Transportista no encontrado'
            });
        }

        res.json({
            success: true,
            transportista: transportistas[0]
        });

    } catch (error) {
        logError('Error cargando transportista:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar transportista'
        });
    }
});

app.put('/api/admin/transportistas/:id', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, cedula, telefono, licencia, vehiculo, peso_maximo, estado } = req.body;
        const empresaId = req.user.empresa_id;
        const [transportistaCheck] = await pool.query(
            'SELECT id_transportista FROM transportistas WHERE id_transportista = ? AND empresa_id = ?',
            [id, empresaId]
        );

        if (transportistaCheck.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para editar este transportista'
            });
        }
        if (cedula) {
            const [existingCedula] = await pool.query(
                'SELECT id_transportista FROM transportistas WHERE cedula = ? AND id_transportista != ?',
                [cedula, id]
            );

            if (existingCedula.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'La cédula ya está registrada por otro transportista'
                });
            }
        }

        await pool.query(
            `UPDATE transportistas 
             SET nombre = ?, cedula = ?, telefono = ?, licencia = ?, vehiculo = ?, peso_maximo = ?, estado = ?
             WHERE id_transportista = ?`,
            [nombre, cedula, telefono, licencia, vehiculo, peso_maximo, estado, id]
        );

        res.json({
            success: true,
            message: 'Transportista actualizado exitosamente'
        });

    } catch (error) {
        logError('Error actualizando transportista:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar transportista'
        });
    }
});

app.post('/api/admin/transportistas', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const {
            nombre,
            telefono,
            correo,
            contraseña,
            cedula,
            licencia,
            vehiculo,
            peso_maximo
        } = req.body;

        const empresaId = req.user.empresa_id;

        if (!nombre || !correo || !contraseña || !cedula || !licencia || !vehiculo) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos obligatorios deben ser completados'
            });
        }
        const [existingUser] = await pool.query(
            'SELECT id_usuario FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El correo electrónico ya está registrado'
            });
        }
        const [existingCedula] = await pool.query(
            'SELECT id_transportista FROM transportistas WHERE cedula = ?',
            [cedula]
        );

        if (existingCedula.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'La cédula ya está registrada'
            });
        }
        await pool.query('START TRANSACTION');

        try {
            const hashedPassword = await bcrypt.hash(contraseña, 10);
            
            const [userResult] = await pool.query(
                'INSERT INTO usuarios (empresa_id, correo, contraseña, id_rol, activo) VALUES (?, ?, ?, ?, ?)',
                [empresaId, correo, hashedPassword, 2, 1]
            );

            const userId = userResult.insertId;
            const [transportistaResult] = await pool.query(
                `INSERT INTO transportistas 
                (empresa_id, nombre, telefono, id_usuario, cedula, licencia, vehiculo, peso_maximo, estado) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Libre')`,
                [empresaId, nombre, telefono, userId, cedula, licencia, vehiculo, peso_maximo]
            );

            const transportistaId = transportistaResult.insertId;
            await pool.query(
                'INSERT INTO chats (empresa_id, transportista_id, activo) VALUES (?, ?, 1)',
                [empresaId, transportistaId]
            );
            await pool.query('COMMIT');

            logInfo(`Transportista creado: ${nombre} (ID: ${transportistaId})`);

            res.json({
                success: true,
                message: 'Transportista creado exitosamente',
                transportista: {
                    id: transportistaId,
                    nombre,
                    correo,
                    cedula,
                    vehiculo
                }
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        logError('Error creando transportista:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear transportista',
            error: error.message
        });
    }
});

app.delete('/api/admin/transportistas/:id', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresa_id;
        const [transportistaCheck] = await pool.query(
            'SELECT id_transportista, id_usuario FROM transportistas WHERE id_transportista = ? AND empresa_id = ?',
            [id, empresaId]
        );

        if (transportistaCheck.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para eliminar este transportista'
            });
        }

        const userId = transportistaCheck[0].id_usuario;

        await pool.query('START TRANSACTION');

        try {
            await pool.query('DELETE FROM transportistas WHERE id_transportista = ?', [id]);
            await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [userId]);
            await pool.query('DELETE FROM chats WHERE transportista_id = ?', [id]);

            await pool.query('COMMIT');

            res.json({
                success: true,
                message: 'Transportista eliminado exitosamente'
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        logError('Error eliminando transportista:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar transportista'
        });
    }
});

app.get('/api/admin/pedidos', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        
        const [pedidos] = await pool.query(`
            SELECT 
                p.id_pedido,
                p.descripcion,
                p.fecha_envio,
                p.tipo_carga,
                p.costo,
                p.fecha_creacion,
                p.direccion_origen,
                p.direccion_destino,
                u.correo as cliente_correo,
                t.nombre as transportista_nombre,
                env.estado as estado_envio,
                env.id_envio
            FROM pedidos p
            LEFT JOIN usuarios u ON p.id_usuario = u.id_usuario
            LEFT JOIN envios env ON p.id_pedido = env.id_pedido
            LEFT JOIN transportistas t ON env.id_transportista = t.id_transportista
            WHERE p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC
        `, [empresaId]);

        res.json({
            success: true,
            pedidos: pedidos,
            total: pedidos.length
        });

    } catch (error) {
        logError('Error cargando pedidos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar pedidos'
        });
    }
});
app.get('/api/admin/pedidos/estadisticas', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        
        const [porTipoCarga] = await pool.query(`
            SELECT tipo_carga, COUNT(*) as total
            FROM pedidos 
            WHERE tipo_carga IS NOT NULL AND empresa_id = ?
            GROUP BY tipo_carga
            ORDER BY total DESC
        `, [empresaId]);

        const [porEstado] = await pool.query(`
            SELECT e.estado, COUNT(*) as total
            FROM envios e
            JOIN pedidos p ON e.id_pedido = p.id_pedido
            WHERE p.empresa_id = ?
            GROUP BY e.estado
        `, [empresaId]);

        const [ingresosMensuales] = await pool.query(`
            SELECT 
                DATE_FORMAT(fecha_creacion, '%Y-%m') as mes,
                SUM(costo) as ingresos,
                COUNT(*) as total_pedidos
            FROM pedidos 
            WHERE fecha_creacion >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND empresa_id = ?
            GROUP BY DATE_FORMAT(fecha_creacion, '%Y-%m')
            ORDER BY mes
        `, [empresaId]);

        res.json({
            success: true,
            porTipoCarga: porTipoCarga,
            porEstado: porEstado,
            ingresosMensuales: ingresosMensuales
        });

    } catch (error) {
        logError('Error en estadísticas de pedidos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar estadísticas'
        });
    }
});

app.put('/api/admin/pedidos/:id/estado', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const empresaId = req.user.empresa_id;

        const [pedidoCheck] = await pool.query('SELECT id_pedido FROM pedidos WHERE id_pedido = ? AND empresa_id = ?', [id, empresaId]);
        
        if (pedidoCheck.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para actualizar este pedido'
            });
        }

        await pool.query(
            'UPDATE envios SET estado = ? WHERE id_pedido = ?',
            [estado, id]
        );

        res.json({
            success: true,
            message: `Estado del pedido actualizado a: ${estado}`
        });

    } catch (error) {
        logError('Error actualizando pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar pedido'
        });
    }
});

app.delete('/api/admin/pedidos/:id', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresa_id;

        const [pedidoCheck] = await pool.query('SELECT id_pedido FROM pedidos WHERE id_pedido = ? AND empresa_id = ?', [id, empresaId]);
        
        if (pedidoCheck.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para eliminar este pedido'
            });
        }

        await pool.query('DELETE FROM envios WHERE id_pedido = ?', [id]);
        await pool.query('DELETE FROM pedidos WHERE id_pedido = ?', [id]);

        res.json({
            success: true,
            message: 'Pedido eliminado exitosamente'
        });

    } catch (error) {
        logError('Error eliminando pedido:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar pedido'
        });
    }
});

app.get('/api/admin/reportes', authMiddleware, checkRole('Administrador'), async (req, res) => {
    try {
        const empresaId = req.user.empresa_id;
        
        const [pedidosPorMes] = await pool.query(`
            SELECT 
                MONTH(p.fecha_creacion) as mes,
                COUNT(*) as total_pedidos,
                COALESCE(SUM(p.costo), 0) as ingresos
            FROM pedidos p
            WHERE p.fecha_creacion >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND p.empresa_id = ?
            GROUP BY MONTH(p.fecha_creacion)
            ORDER BY mes
        `, [empresaId]);

        const [transportistasActivos] = await pool.query(`
            SELECT 
                t.nombre,
                COUNT(e.id_envio) as envios_completados,
                SUM(CASE WHEN e.estado = 'ENTREGADO' THEN 1 ELSE 0 END) as entregados
            FROM transportistas t
            LEFT JOIN envios e ON t.id_transportista = e.id_transportista
            WHERE t.empresa_id = ?
            GROUP BY t.id_transportista, t.nombre
            ORDER BY envios_completados DESC
            LIMIT 10
        `, [empresaId]);

        res.json({
            success: true,
            pedidosPorMes: pedidosPorMes,
            transportistasActivos: transportistasActivos
        });

    } catch (error) {
        logError('Error cargando reportes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar reportes'
        });
    }
});

app.post('/api/auth/login-admin', async (req, res) => {
    const { correo, contraseña } = req.body;

    if (!correo || !contraseña) {
        return res.status(400).json({ 
            success: false, 
            message: 'Correo y contraseña son obligatorios.' 
        });
    }

    try {
        const [users] = await pool.query(`
            SELECT u.*, r.nombre as rol, e.nombre_empresa 
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id_rol 
            LEFT JOIN empresas e ON u.empresa_id = e.empresa_id
            WHERE u.correo = ? AND u.activo = 1
        `, [correo]);

        if (users.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Credenciales incorrectas o usuario inactivo.' 
            });
        }

        const user = users[0];

        if (user.id_rol !== 1) {
            return res.status(403).json({ 
                success: false, 
                message: 'Acceso denegado. Solo administradores pueden acceder.' 
            });
        }

        const isPasswordValid = await bcrypt.compare(contraseña, user.contraseña);
        if (!isPasswordValid) {
            return res.status(400).json({ 
                success: false, 
                message: 'Credenciales incorrectas.' 
            });
        }

        const token = jwt.sign(
            { 
                id_usuario: user.id_usuario, 
                id_rol: user.id_rol,
                correo: user.correo,
                empresa_id: user.empresa_id,
                empresa_nombre: user.nombre_empresa,
                rol: user.rol
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        logInfo(`Login exitoso - Admin: ${user.correo}`);

        return res.json({ 
            success: true, 
            message: 'Login exitoso.',
            token: token,
            user: {
                id: user.id_usuario,
                correo: user.correo,
                rol: user.rol,
                empresa_id: user.empresa_id,
                empresa_nombre: user.nombre_empresa
            }
        });

    } catch (error) {
        logError('Error en login de administrador:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor.' 
        });
    }
});
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.json({ 
        success: true, 
        message: 'Sesión cerrada exitosamente' 
    });
});

app.get('/', (req, res) => {
    res.json({ success: true, message: 'API de gestión de pedidos y empresas activa. ¡Bienvenido!' });
});
app.get('/api/health', async (req, res) => {
    try {
        const [dbResult] = await pool.query('SELECT 1 as status');
        const [transportistas] = await pool.query('SELECT COUNT(*) as total FROM transportistas');
        const [pedidos] = await pool.query('SELECT COUNT(*) as total FROM pedidos');
        const [chats] = await pool.query('SELECT COUNT(*) as total FROM chats');
        const [mensajes] = await pool.query('SELECT COUNT(*) as total FROM mensajes');
        
        res.json({
            status: 'healthy',
            database: dbResult[0].status === 1 ? 'connected' : 'error',
            tables: {
                transportistas: transportistas[0].total,
                pedidos: pedidos[0].total,
                chats: chats[0].total,
                mensajes: mensajes[0].total
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy', 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

const empresasRoutes = require('./routes/empresasRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const transportistasRoutes = require('./routes/transportistasRoutes');
const asignacionesRoutes = require('./routes/asignacionesRoutes'); 
const loginRoutes = require('./routes/loginRoutes');
const registroRoutes = require('./routes/registroRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const notificacionesModule = require('./routes/notificacionesRoutes'); 
const notificacionesRoutes = notificacionesModule.router;
app.use('/api/notificaciones', notificacionesRoutes);
app.get('/api/mapa-empresas', async (req, res) => {
  try {
    console.log('🌍 [RUTA PUBLICA] /api/mapa-empresas solicitado');
    
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
    
    console.log(`📍 ${empresas.length} empresas encontradas`);
    if (empresas.length > 0) {
      console.log('Empresas con coordenadas:');
      empresas.forEach((emp, i) => {
        console.log(`   ${i+1}. ${emp.nombre_empresa} - Lat: ${emp.latitud}, Lng: ${emp.longitud}`);
      });
    }
    
    const respuesta = empresas.map(emp => ({
      empresa_id: emp.empresa_id,
      nombre_empresa: emp.nombre_empresa || 'Empresa',
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
    console.error('Error en /api/mapa-empresas:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo empresas para mapa'
    });
  }
});

app.post('/api/empresas/registro', async (req, res) => {
    const {
        nombre_empresa,
        nombre_titular,
        ruc,
        ciudad,
        correo_electronico,
        contraseña,
        telefono,
        latitud,
        longitud
    } = req.body;

    console.log('📝 Registro empresa:', nombre_empresa);

    if (!nombre_empresa || !ruc || !correo_electronico || !contraseña) {
        return res.status(400).json({
            success: false,
            message: 'Faltan campos obligatorios'
        });
    }

    try {
        const [existeRuc] = await pool.execute(
            'SELECT empresa_id FROM empresas WHERE ruc = ?',
            [ruc]
        );
        
        if (existeRuc.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe una empresa con este RUC'
            });
        }

        const [existeCorreo] = await pool.execute(
            'SELECT empresa_id FROM empresas WHERE correo_electronico = ?',
            [correo_electronico]
        );
        
        if (existeCorreo.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe una empresa con este correo'
            });
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(contraseña, 10);

        const [result] = await pool.execute(
            `INSERT INTO empresas 
             (nombre_empresa, nombre_titular, ruc, ciudad, correo_electronico, 
              contraseña, telefono, latitud, longitud, fecha, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'activo')`,
            [
                nombre_empresa,
                nombre_titular || null,
                ruc,
                ciudad || null,
                correo_electronico,
                hashedPassword,
                telefono || null,
                latitud || null,
                longitud || null
            ]
        );

        console.log(`✅ Empresa registrada ID: ${result.insertId}`);

        res.status(201).json({
            success: true,
            message: 'Empresa registrada exitosamente',
            empresa_id: result.insertId
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar empresa: ' + error.message
        });
    }
});
app.use('/api/empresas', authMiddleware, empresasRoutes);
app.use('/api/pedidos', authMiddleware, pedidosRoutes);
app.use('/api/auth', loginRoutes); 
app.use('/api/auth', registroRoutes);
app.use('/api/asignaciones', authMiddleware, asignacionesRoutes);
app.use('/api/config', require('./routes/configRoutes'));
app.use('/api/transportistas', authMiddleware, transportistasRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

const port = process.env.PORT || 3000;
const server = require('http').createServer(app);

const io = setupWebSocket(server);
notificacionesModule.setIO(io);
app.set('socketio', getIO());
require('./routes/notificacionesRoutes').setIO(io);


server.listen(port, '0.0.0.0', async () => {
    console.log(`Servidor de la API escuchando en http://0.0.0.0:${port}`);
    console.log(`WebSocket activo en el mismo puerto`);
    console.log(`Health check: http://0.0.0.0:${port}/api/health`);
    console.log(`Panel admin: http://0.0.0.0:${port}/api/admin/dashboard`);
    console.log(`Módulo pedidos: http://0.0.0.0:${port}/api/admin/pedidos`);
    console.log(`Módulo chat: http://0.0.0.0:${port}/api/chats/transportista/1`);
    console.log(`Ruta empresas: http://0.0.0.0:${port}/api/empresas/todas`);
    console.log(`Documentación: http://0.0.0.0:${port}/api-docs`);
    console.log(`Registro transportistas: http://0.0.0.0:${port}/api/auth/registro-transportista`);
    console.log(`Registro administradores: http://0.0.0.0:${port}/api/auth/registro-admin`);
    console.log(`Empresas activas: http://0.0.0.0:${port}/api/auth/empresas-activas`);
    console.log(`Frontend: http://127.0.0.1:5500/frontend/administrador.html`);
    await checkDatabaseConnection();
});
