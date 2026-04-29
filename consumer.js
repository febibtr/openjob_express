require('dotenv').config();
const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const pool = new Pool();

const initConsumer = async () => {
    try {
        const connection = await amqp.connect(`amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
        const channel = await connection.createChannel();
        await channel.assertQueue('application_queue', { durable: true });

        const transporter = nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            port: process.env.MAIL_PORT,
            secure: true,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASSWORD,
            },
        });

        console.log('👷 Consumer berjalan dan menunggu pesan dari RabbitMQ...');

        channel.consume('application_queue', async (msg) => {
            if (msg !== null) {
                const { application_id } = JSON.parse(msg.content.toString());
                console.log(`Pesan diterima: Aplikasi ID ${application_id}`);

                const query = `
                    SELECT 
                        u_applicant.name AS applicant_name, 
                        u_applicant.email AS applicant_email,
                        j.title AS job_title, 
                        u_owner.email AS owner_email
                    FROM applications a
                    JOIN users u_applicant ON a.user_id = u_applicant.id
                    JOIN jobs j ON a.job_id = j.id
                    JOIN companies c ON j.company_id = c.id
                    JOIN users u_owner ON c.owner = u_owner.id
                    WHERE a.id = $1
                `;
                
                const result = await pool.query(query, [application_id]);

                if (result.rows.length > 0) {
                    const data = result.rows[0];
                    const mailOptions = {
                        from: process.env.MAIL_USER,
                        to: data.owner_email,
                        subject: `Lamaran Baru untuk Posisi ${data.job_title}`,
                        text: `Halo,\n\nAda kandidat baru yang melamar untuk posisi ${data.job_title}.\n\nDetail Kandidat:\n- Nama: ${data.applicant_name}\n- Email: ${data.applicant_email}\n- Waktu: ${new Date().toLocaleString()}\n\nTerima kasih.`
                    };

                    await transporter.sendMail(mailOptions);
                    console.log(`✅ Email berhasil dikirim ke ${data.owner_email}`);
                }
                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error('❌ Gagal menjalankan Consumer:', error);
    }
};

initConsumer();