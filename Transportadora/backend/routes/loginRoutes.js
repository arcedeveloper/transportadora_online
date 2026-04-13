const express = require('express');
const router = express.Router();
const pool = require('../models/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
router.post('/login', async (req, res) => {
    const { correo, contraseña } = req.body;

    console.log('🔐 FLUTTER - Login unificado para:', correo);

    if (!correo || !contraseña) {
        return res.status(400).json({ 
            success: false, 
            message: 'Correo y contraseña son obligatorios.' 
        });
    }

    try {
        const [users] = await pool.query(`
            SELECT u.*, r.nombre as rol, 
                   t.id_transportista,
                   c.id_cliente,
                   e.nombre_empresa
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id_rol 
            LEFT JOIN transportistas t ON u.id_usuario = t.id_usuario
            LEFT JOIN clientes c ON u.id_usuario = c.id_usuario
            LEFT JOIN empresas e ON u.empresa_id = e.empresa_id
            WHERE u.correo = ? AND u.activo = 1
        `, [correo]);

        console.log('👤 Usuarios encontrados:', users.length);

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas o usuario inactivo.' 
            });
        }

        const user = users[0];
        const isPasswordValid = await bcrypt.compare(contraseña, user.contraseña);
        console.log('🔐 Contraseña válida:', isPasswordValid);

        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas.' 
            });
        }
        const userData = {
            id_usuario: user.id_usuario,
            id_rol: user.id_rol,
            correo: user.correo,
            empresa_id: user.empresa_id,
            nombre_empresa: user.nombre_empresa,
            rol: user.rol
        };
        if (user.id_rol === 2 && user.id_transportista) {
            userData.id_transportista = user.id_transportista;
        } 
        if (user.id_rol === 3 && user.id_cliente) {
            userData.id_cliente = user.id_cliente;
        }
        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '24h' });

        console.log('Login unificado exitoso:', user.correo);
        console.log('Datos usuario:', userData);

        return res.json({ 
            success: true, 
            message: 'Login exitoso.',
            usuario: userData,  
            token: token
        });

    } catch (error) {
        console.error('Error en login unificado:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor.' 
        });
    }
});
router.post('/register', async (req, res) => {
    const { 
        nombre_empresa, 
        correo_electronico, 
        contraseña, 
        telefono, 
        ciudad,         
        nombre_titular, 
        ruc,
        latitud,          
        longitud        
    } = req.body;

    console.log('📝 Registro de empresa:', { 
        nombre_empresa, 
        correo_electronico, 
        ciudad,
        latitud, 
        longitud 
    });
    if (!nombre_empresa || !correo_electronico || !contraseña || !ciudad) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nombre, correo, contraseña y ciudad son requeridos.' 
        });
    }

    try {
        const [existing] = await pool.query(
            'SELECT empresa_id FROM empresas WHERE correo_electronico = ?',
            [correo_electronico]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El correo electrónico ya está registrado.'
            });
        }
        const hashedPassword = await bcrypt.hash(contraseña, 10);
        const [result] = await pool.query(
            `INSERT INTO empresas 
             (nombre_empresa, correo_electronico, contraseña, telefono, ciudad, nombre_titular, ruc, latitud, longitud, fecha) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,  
            [
                nombre_empresa, 
                correo_electronico, 
                hashedPassword, 
                telefono, 
                ciudad,         
                nombre_titular, 
                ruc,
                latitud || null,  
                longitud || null  
            ]
        );

        console.log('Empresa registrada con ID:', result.insertId);
        console.log('Datos guardados:', { ciudad, latitud, longitud });

        res.status(201).json({
            success: true,
            message: 'Empresa registrada exitosamente.',
            empresaId: result.insertId
        });

    } catch (err) {
        console.error('Error en registro de empresa:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor.' 
        });
    }
});
router.post('/login-empresa', async (req, res) => {
    const { correo, contraseña } = req.body;

    console.log('Login empresa - Correo recibido:', correo);

    if (!correo || !contraseña) {
        return res.status(400).json({ success: false, message: 'Correo y contraseña son requeridos.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT empresa_id, nombre_empresa, correo_electronico, contraseña, telefono, ciudad, nombre_titular, ruc, fecha
             FROM empresas 
             WHERE correo_electronico = ?`,
            [correo]
        );

        console.log('Empresas encontradas:', rows.length);

        if (!rows.length) {
            console.log('No se encontró empresa con ese correo');
            return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
        }

        const empresa = rows[0];
        console.log('🏢 Empresa encontrada:', empresa.nombre_empresa);
        console.log('🔑 Contraseña en BD:', empresa.contraseña ? 'EXISTE' : 'NO EXISTE');

        if (!empresa.contraseña) {
            console.log('No hay contraseña en la base de datos');
            return res.status(500).json({ success: false, message: 'Error: contraseña no encontrada en la base de datos.' });
        }

        console.log('🔍 Comparando contraseñas...');
        const passwordMatch = await bcrypt.compare(contraseña, empresa.contraseña);
        console.log('✅ Resultado comparación:', passwordMatch);

        if (!passwordMatch) {
            console.log('Contraseña incorrecta');
            return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
        }
        const token = jwt.sign(
            { 
                tipo: 'empresa',
                empresa_id: empresa.empresa_id,
                correo: empresa.correo_electronico,
                nombre_empresa: empresa.nombre_empresa
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const empresaInfo = {
            empresa_id: empresa.empresa_id, 
            nombre_empresa: empresa.nombre_empresa,
            correo_electronico: empresa.correo_electronico,
            telefono: empresa.telefono,
            ciudad: empresa.ciudad,
            nombre_titular: empresa.nombre_titular,
            ruc: empresa.ruc,
            fecha: empresa.fecha
        };

        console.log('Login exitoso para:', empresa.nombre_empresa);
        console.log('Token generado para empresa');

        return res.json({
            success: true,
            message: 'Inicio de sesión exitoso.',
            empresa: empresaInfo,
            token: token 
        });

    } catch (err) {
        console.error('Error en login empresa:', err);
        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});
router.post('/login-admin', async (req, res) => {
    const { correo, contraseña } = req.body;

    console.log('Login de administrador:', correo);

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
            WHERE u.correo = ? AND u.activo = 1 AND u.id_rol = 1
        `, [correo]);

        console.log('👤 Administradores encontrados:', users.length);

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas o usuario inactivo.' 
            });
        }

        const user = users[0];
        
        const isPasswordValid = await bcrypt.compare(contraseña, user.contraseña);
        console.log('🔐 Contraseña válida:', isPasswordValid);

        if (!isPasswordValid) {
            return res.status(401).json({ 
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
                nombre_empresa: user.nombre_empresa
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('Login exitoso - Administrador:', user.correo);
        console.log('Empresa ID del administrador:', user.empresa_id);

        return res.json({ 
            success: true, 
            message: 'Login exitoso.',
            user: {
                id: user.id_usuario,
                correo: user.correo,
                rol: user.rol,
                empresa_id: user.empresa_id,
                nombre_empresa: user.nombre_empresa
            },
            token: token
        });

    } catch (error) {
        console.error('Error en login de administrador:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor.' 
        });
    }
});

router.post('/login-transportista', async (req, res) => {
    const { correo, contraseña } = req.body;

    console.log('🚚 Login de transportista:', correo);

    if (!correo || !contraseña) {
        return res.status(400).json({ 
            success: false, 
            message: 'Correo y contraseña son obligatorios.' 
        });
    }

    try {
        const [users] = await pool.query(`
            SELECT u.*, r.nombre as rol, t.*, e.nombre_empresa
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id_rol 
            JOIN transportistas t ON u.id_usuario = t.id_usuario
            LEFT JOIN empresas e ON u.empresa_id = e.empresa_id
            WHERE u.correo = ? AND u.activo = 1 AND u.id_rol = 2
        `, [correo]);

        console.log('👤 Transportistas encontrados:', users.length);

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas.' 
            });
        }

        const user = users[0];
        
        const isPasswordValid = await bcrypt.compare(contraseña, user.contraseña);
        console.log('🔐 Contraseña válida:', isPasswordValid);

        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas.' 
            });
        }
        const token = jwt.sign(
            { 
                id_usuario: user.id_usuario, 
                id_rol: user.id_rol,
                id_transportista: user.id_transportista,
                correo: user.correo,
                empresa_id: user.empresa_id,
                nombre_empresa: user.nombre_empresa
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        console.log('Login exitoso - Transportista:', user.nombre);
        console.log('Empresa ID del transportista:', user.empresa_id);

        return res.json({ 
            success: true, 
            message: 'Login exitoso.',
            user: {
                id: user.id_usuario,
                id_transportista: user.id_transportista,
                correo: user.correo,
                rol: user.rol,
                nombre: user.nombre,
                telefono: user.telefono,
                vehiculo: user.vehiculo,
                empresa_id: user.empresa_id,
                nombre_empresa: user.nombre_empresa
            },
            token: token
        });

    } catch (error) {
        console.error('Error en login de transportista:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor.' 
        });
    }
});
router.post('/login-cliente', async (req, res) => {
    console.log('📱 FLUTTER - Login cliente recibido');
    console.log('Body:', req.body);

    const { correo, cedula } = req.body;

    if (!correo || !cedula) {
        return res.status(400).json({ 
            success: false, 
            message: 'Correo y cédula son obligatorios.' 
        });
    }

    try {
        const [users] = await pool.query(`
            SELECT u.*, r.nombre as rol, c.id_cliente, e.nombre_empresa
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id_rol 
            JOIN clientes c ON u.id_usuario = c.id_usuario
            LEFT JOIN empresas e ON u.empresa_id = e.empresa_id
            WHERE u.correo = ? AND c.cedula = ? AND u.activo = 1 AND u.id_rol = 3
        `, [correo, cedula]);

        console.log('👤 Clientes encontrados:', users.length);

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas.' 
            });
        }

        const user = users[0];
        const token = jwt.sign(
            { 
                id_usuario: user.id_usuario, 
                id_rol: user.id_rol,
                id_cliente: user.id_cliente,
                correo: user.correo,
                tipo: 'cliente',
                empresa_id: user.empresa_id,
                nombre_empresa: user.nombre_empresa
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        console.log('Login exitoso - Cliente ID:', user.id_cliente);

        return res.json({ 
            success: true, 
            message: 'Login exitoso.',
            clienteId: user.id_cliente,
            userId: user.id_usuario,
            user: {
                id: user.id_usuario,
                id_cliente: user.id_cliente,
                correo: user.correo,
                rol: user.rol,
                tipo: 'cliente',
                empresa_id: user.empresa_id,
                nombre_empresa: user.nombre_empresa
            },
            token: token
        });

    } catch (error) {
        console.error('Error login cliente:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor.' 
        });
    }
});

router.get('/empresas-activas', async (req, res) => {
    try {
        console.log('🏢 Solicitando empresas activas...');
        
        const [empresas] = await pool.query(`
            SELECT empresa_id, nombre_empresa, correo_electronico, telefono, ciudad, ruc
            FROM empresas 
            WHERE empresa_id IS NOT NULL
            ORDER BY nombre_empresa
        `);

        console.log(`✅ Empresas activas encontradas: ${empresas.length}`);

        res.json({
            success: true,
            empresas: empresas,
            total: empresas.length
        });

    } catch (error) {
        console.error('Error obteniendo empresas activas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener empresas activas'
        });
    }
});

module.exports = router;