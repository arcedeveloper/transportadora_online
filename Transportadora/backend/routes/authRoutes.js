
const express = require('express');
const router = express.Router();
const pool = require('../models/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'defaultsecret';
router.post('/register', async (req, res) => {
    const { correo, contraseña, id_rol } = req.body;
    if (!correo || !contraseña || !id_rol) return res.status(400).json({ message: 'Faltan datos' });

    try {
        const [existing] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        if (existing.length) return res.status(400).json({ message: 'El correo ya está registrado' });

        const hash = await bcrypt.hash(contraseña, 10);
        const [result] = await pool.query('INSERT INTO usuarios (correo, contraseña, id_rol) VALUES (?, ?, ?)', [correo, hash, id_rol]);

        res.status(201).json({ message: 'Usuario registrado correctamente', id_usuario: result.insertId });
    } catch (err) {
        console.error("Error en /register:", err);
        res.status(500).json({ message: 'Error del servidor' });
    }
});

router.post('/login', async (req, res) => {
    const { correo, contraseña } = req.body;
    if (!correo || !contraseña) return res.status(400).json({ message: 'Faltan datos' });

    try {
        console.log('Intento de login para:', correo);
        
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        if (!rows.length) return res.status(400).json({ message: 'Usuario no encontrado' });

        const usuario = rows[0];
        const valid = await bcrypt.compare(contraseña, usuario.contraseña);
        if (!valid) return res.status(400).json({ message: 'Contraseña incorrecta' });
        let empresa_id = usuario.empresa_id;
        
        console.log('Buscando empresa_id para usuario:', {
            id_usuario: usuario.id_usuario,
            id_rol: usuario.id_rol,
            empresa_id_actual: empresa_id
        });
        if (usuario.id_rol === 2 && !empresa_id) {
            console.log('Buscando empresa_id en tabla transportistas...');
            const [transportista] = await pool.query(
                'SELECT empresa_id FROM transportistas WHERE id_usuario = ?', 
                [usuario.id_usuario]
            );
            if (transportista.length > 0) {
                empresa_id = transportista[0].empresa_id;
                console.log('Empresa_id encontrada en transportistas:', empresa_id);
            } else {
                console.log('Transportista no encontrado en tabla transportistas');
            }
        }
        if (usuario.id_rol === 1 && !empresa_id) {
            console.log('Buscando empresa_id en tabla empresas...');
            const [empresa] = await pool.query(
                'SELECT empresa_id FROM empresas WHERE correo_electronico = ?', 
                [correo]
            );
            if (empresa.length > 0) {
                empresa_id = empresa[0].empresa_id;
                console.log('Empresa_id encontrada en empresas:', empresa_id);
            }
        }
        if (!empresa_id) {
            empresa_id = 1; 
            console.log('Usando empresa por defecto:', empresa_id);
        }

        console.log('Datos finales para token:', {
            id_usuario: usuario.id_usuario,
            id_rol: usuario.id_rol,
            empresa_id: empresa_id
        });
        const token = jwt.sign(
            { 
                id_usuario: usuario.id_usuario, 
                id_rol: usuario.id_rol,
                empresa_id: empresa_id 
            },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 24*60*60*1000
        });
        let userData = {
            id_usuario: usuario.id_usuario, 
            id_rol: usuario.id_rol,
            empresa_id: empresa_id,
            correo: usuario.correo
        };
        if (usuario.id_rol === 2) {
            const [transportistaData] = await pool.query(
                'SELECT id_transportista, nombre FROM transportistas WHERE id_usuario = ?',
                [usuario.id_usuario]
            );
            if (transportistaData.length > 0) {
                userData.id_transportista = transportistaData[0].id_transportista;
                userData.nombre = transportistaData[0].nombre;
            }
        }

        res.json({ 
            message: 'Login exitoso',
            success: true,
            usuario: userData,
            token: token 
        });

        console.log('Login exitoso para:', correo);

    } catch (err) {
        console.error("Error en /login:", err);
        res.status(500).json({ message: 'Error del servidor: ' + err.message });
    }
});
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Sesión cerrada' });
});

router.get('/empresas-activas', async (req, res) => {
    try {
        console.log('Solicitando empresas activas...');
        
        const [empresas] = await pool.query(`
            SELECT empresa_id, nombre_empresa, correo_electronico, telefono, ciudad 
            FROM empresas 
            WHERE empresa_id IS NOT NULL 
            ORDER BY nombre_empresa
        `);
        
        console.log(`Empresas activas encontradas: ${empresas.length}`);
        
        res.json({
            success: true,
            empresas: empresas
        });
        
    } catch (err) {
        console.error('Error obteniendo empresas activas:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener empresas activas' 
        });
    }
});

module.exports = router;