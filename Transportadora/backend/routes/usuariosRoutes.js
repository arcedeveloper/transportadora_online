const express = require('express');
const router = express.Router();
const pool = require('../db'); 

router.post('/login-rapido', async (req, res) => {
    const { email, ci } = req.body;

    if (!email || !ci) {
        return res.status(400).json({ success: false, message: 'Faltan datos.' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ? AND ci = ?', [email, ci]);

        let usuario;
        if (rows.length === 0) {
            const [nuevo] = await pool.query(
                'INSERT INTO usuarios (email, ci, nombre) VALUES (?, ?, ?)',
                [email, ci, 'Cliente']
            );
            usuario = { id_usuario: nuevo.insertId, email, ci, nombre: 'Cliente' };
        } else {
            usuario = rows[0];
        }

        res.json({
            success: true,
            user: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                email: usuario.email,
            }
        });

    } catch (err) {
        console.error('Error login rápido:', err);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

module.exports = router;
