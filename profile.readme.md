<h1 align="center">Welcome to Coneshare 👋🏼</h1>

<p align="center"><strong>Self-Hosted DocSend Alternative</strong></p>
<p align="center">Secure, Simple, and Reliable</p>

![Screenshot of the Coneshare web UI showcasing its capabilities.](https://raw.githubusercontent.com/coneshare/.github/refs/heads/main/profile/demo.png)

Coneshare is an open-source platform that gives you a secure and private way to manage the entire lifecycle of your sensitive documents: upload, process, secure, share, and track.

## How To Get Started

- **[Docker Compose](https://github.com/coneshare/coneshare-compose)** 🌟 Get up and running in minutes with a single command.

## What’s Inside?

### 🐍 Backend (Django)

- **Framework**: Built with Python and the robust **Django** framework, providing a powerful and secure REST API for all document operations.
- **Asynchronous Processing**: Uses **Celery** and **Redis** to handle document conversions and other long-running tasks in the background, keeping the UI fast.

### 💾 File Server (Go)
- A high-performance, dedicated service written in **Go** to handle all secure file I/O (uploads, downloads), isolating file management from business logic.

### ⚛️ Frontend (React)

- **Framework**: A modern and responsive user interface built with **React**, **Vite**, and **Tailwind CSS** for a fast and intuitive experience.
- **Functionality**: Allows for seamless file uploads, downloads, and sharing through a clean, easy-to-navigate interface.

## Features You’ll Love

- **Self-Hosted**: Full control over your data. Deploy the entire stack easily with Docker Compose.
- **Secure Link Sharing**: Control access with passwords, expiration dates, and email verification.
- **Datarooms**: Organize and share collections of documents and folders through a single, secure link with granular permissions.
- **Detailed Analytics**: Track who views your documents, for how long, and at what completion rate.
- **Dynamic Watermarking**: Protect your documents by applying watermarks with the viewer's email, IP address, or other details.
- **Version History**: Keep track of document updates and access previous versions.

## Contact Us

We’d love to hear from you! Whether you have questions, feedback, or want to get involved, here’s how to reach us:

- **Email**: [dev@coneshare.com](mailto:dev@coneshare.com) – For any direct questions.
