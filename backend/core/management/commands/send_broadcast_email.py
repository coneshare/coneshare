import csv
import os
import re
import sys
import time
from datetime import datetime

from django.conf import settings
from django.core.mail import get_connection, EmailMessage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Send broadcast emails (e.g., release notes) to a list of clients from a CSV file "
        "using a plain-text template with personalized greeting, dry-run, rate-limiting, and resumption."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--csv",
            default="clients.csv",
            help="Path to the recipients CSV file (default: clients.csv).",
        )
        parser.add_argument(
            "--template",
            default="mail-1.10.txt",
            help="Path to the email body template file (default: mail-1.10.txt).",
        )
        parser.add_argument(
            "--subject",
            default="Coneshare V1.10 is out!",
            help="Email subject line.",
        )
        parser.add_argument(
            "--from-email",
            default=None,
            help="Sender email address (default: settings.DEFAULT_FROM_EMAIL).",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=1.5,
            help="Delay in seconds between sending each email to prevent spam flags (default: 1.5).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview recipients and emails without actually sending anything.",
        )
        parser.add_argument(
            "--log-file",
            default="sent_broadcast_emails.log",
            help="Path to the log file tracking sent emails to allow resuming (default: sent_broadcast_emails.log).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Ignore the sent log and send to all recipients in the CSV.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Limit the number of emails to send in this run (useful for small test batches).",
        )
        parser.add_argument(
            "--exclude-emails",
            default="",
            help="Comma-separated list of email addresses to exclude (e.g. your own admin email).",
        )
        parser.add_argument(
            "--only-email",
            default=None,
            help="Send exclusively to this specific email address (safe for testing yourself).",
        )

    def _resolve_file_path(self, path):
        """Resolves file path checking current dir, parent dir, and project roots."""
        if os.path.exists(path):
            return os.path.abspath(path)

        # Check relative to repo root or backend parent
        candidates = [
            os.path.join(settings.BASE_DIR, path),
            os.path.join(os.path.dirname(settings.BASE_DIR), path),
            os.path.join("/app", path),
        ]
        for candidate in candidates:
            if os.path.exists(candidate):
                return os.path.abspath(candidate)

        return None

    def _load_sent_log(self, log_path):
        """Loads already sent email addresses to allow safe resumption."""
        sent_emails = set()
        if not os.path.exists(log_path):
            return sent_emails

        try:
            with open(log_path, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split("|")
                    if len(parts) >= 2:
                        email = parts[1].strip().lower()
                        if email:
                            sent_emails.add(email)
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"Could not read sent log ({e}). Starting fresh."))

        return sent_emails

    def _append_sent_log(self, log_path, email, name):
        """Appends a successfully sent email to the log file."""
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
                f.write(f"{timestamp} | {email} | {name}\n")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"Failed to append to sent log ({e})."))

    def _find_column(self, headers, candidates):
        header_map = {h.strip().lower(): h for h in headers if h}
        for candidate in candidates:
            if candidate.lower() in header_map:
                return header_map[candidate.lower()]
        return None

    def _personalize_body(self, template_text, name):
        """Replaces [Name] placeholders with client name or a clean fallback."""
        cleaned_name = (name or "").strip()
        if cleaned_name:
            # Replace [Name] with actual name
            body = template_text.replace("[Name]", cleaned_name)
        else:
            # If name is blank or missing, turn "Hi [Name]," into "Hi," or "Hi there,"
            body = re.sub(r"Hi\s+\[Name\]\s*,", "Hi,", template_text)
            body = body.replace("[Name]", "")
        return body

    def handle(self, *args, **options):
        csv_arg = options["csv"]
        template_arg = options["template"]
        subject = options["subject"].strip()
        from_email = options["from_email"] or getattr(settings, "DEFAULT_FROM_EMAIL", "Coneshare <support@coneshare.com>")
        delay = options["delay"]
        is_dry_run = options["dry_run"]
        log_file_arg = options["log_file"]
        force = options["force"]
        limit = options["limit"]
        exclude_arg = options["exclude_emails"]
        excluded_emails = {e.strip().lower() for e in exclude_arg.split(",") if e.strip()}

        # 1. Resolve Template
        template_path = self._resolve_file_path(template_arg)
        if not template_path:
            raise CommandError(f"Template file not found: '{template_arg}'")

        with open(template_path, "r", encoding="utf-8") as f:
            template_text = f.read()

        # 2. Resolve CSV
        csv_path = self._resolve_file_path(csv_arg)
        if not csv_path:
            raise CommandError(
                f"CSV file not found: '{csv_arg}'. Please make sure the file exists."
            )

        # 3. Resolve Sent Log
        log_path = self._resolve_file_path(log_file_arg)
        if not log_path:
            log_path = os.path.abspath(log_file_arg)
        sent_emails = set() if force else self._load_sent_log(log_path)

        # 4. Parse CSV
        recipients = []
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []

            email_col = self._find_column(
                headers, ["email", "e-mail", "mail", "email_address", "邮箱", "电子邮箱"]
            )
            name_col = self._find_column(
                headers, ["name", "full_name", "first_name", "client_name", "contact_name", "姓名", "名字", "客户"]
            )
            status_col = self._find_column(
                headers, ["status", "state", "account_status", "状态", "账号状态"]
            )

            if not email_col:
                raise CommandError(
                    f"Could not find an 'email' column in {csv_path}. Available columns: {headers}"
                )

            inactive_count = 0
            for idx, row in enumerate(reader, start=2):
                raw_email = (row.get(email_col) or "").strip()
                raw_name = (row.get(name_col) or "").strip() if name_col else ""
                raw_status = (row.get(status_col) or "").strip() if status_col else ""

                if not raw_email or "@" not in raw_email:
                    continue

                # Filter inactive accounts if Status column exists
                if status_col and raw_status.lower() in ("inactive", "disabled", "unverified", "suspended", "false", "0"):
                    inactive_count += 1
                    continue

                # Use first name for natural greetings (e.g., "Aaron Griffith" -> "Aaron")
                first_name = raw_name.split()[0] if (" " in raw_name and not raw_name.startswith("Dr.")) else raw_name

                recipients.append({
                    "email": raw_email,
                    "name": first_name,
                    "full_name": raw_name,
                    "line": idx,
                })

        only_email = (options.get("only_email") or "").strip().lower()

        # Filter for single target testing if --only-email is provided
        if only_email:
            matching = [r for r in recipients if r["email"].lower() == only_email]
            if matching:
                recipients = matching
            else:
                recipients = [{"email": only_email, "name": "Justin", "full_name": "Justin", "line": 0}]

        # Filter excluded emails
        if excluded_emails and not only_email:
            recipients = [r for r in recipients if r["email"].lower() not in excluded_emails]

        total_contacts = len(recipients)
        if total_contacts == 0:
            self.stdout.write(self.style.WARNING(f"No active email addresses found in {csv_path} (inactive skipped: {inactive_count})."))
            return

        # Filter already sent
        to_send = [r for r in recipients if r["email"].lower() not in sent_emails]
        skipped_count = total_contacts - len(to_send)

        if limit and limit > 0:
            to_send = to_send[:limit]

        # Display Banner
        mode_str = self.style.NOTICE("[DRY-RUN PREVIEW MODE]") if is_dry_run else self.style.SUCCESS("[LIVE SENDING MODE]")
        self.stdout.write("=" * 64)
        self.stdout.write(f"Coneshare Broadcast Email Dispatcher - {mode_str}")
        self.stdout.write("=" * 64)
        self.stdout.write(f"Template : {template_path}")
        self.stdout.write(f"CSV File : {csv_path}")
        self.stdout.write(f"Subject  : {subject}")
        self.stdout.write(f"From     : {from_email}")
        self.stdout.write(f"SMTP Host: {getattr(settings, 'EMAIL_HOST', 'not set')}:{getattr(settings, 'EMAIL_PORT', 587)}")
        self.stdout.write(f"Active in CSV: {total_contacts}")
        if inactive_count > 0:
            self.stdout.write(f"Inactive     : {inactive_count} (skipped)")
        if excluded_emails:
            self.stdout.write(f"Excluded     : {len(excluded_emails)} addresses")
        self.stdout.write(f"Already sent : {skipped_count} (skipped)")
        self.stdout.write(f"To dispatch  : {len(to_send)}")
        if limit:
            self.stdout.write(f"Limit applied: {limit}")
        self.stdout.write(f"Delay / email: {delay}s")
        self.stdout.write("=" * 64)

        if not to_send:
            self.stdout.write(self.style.SUCCESS("All contacts in the CSV have already been sent to! Nothing to do."))
            return

        # Dry Run Mode Output
        if is_dry_run:
            self.stdout.write(self.style.WARNING("\nDry-run enabled: Showing sample personalized preview:\n"))
            sample = to_send[0]
            sample_body = self._personalize_body(template_text, sample["name"])
            self.stdout.write(f"--- [Sample Preview for: {sample['name']} <{sample['email']}>] ---")
            self.stdout.write(sample_body[:300] + ("\n...[truncated]..." if len(sample_body) > 300 else ""))
            self.stdout.write("-" * 64)
            self.stdout.write(f"\nRecipients to be sent ({len(to_send)}):")
            for i, r in enumerate(to_send, 1):
                name_display = f" ({r['name']})" if r['name'] else ""
                self.stdout.write(f"  {i:3d}. {r['email']}{name_display}")
            self.stdout.write(self.style.SUCCESS(f"\nDry run complete. Run without --dry-run to send real emails."))
            return

        # Live Sending
        connection = get_connection(fail_silently=False)
        connection.open()
        self.stdout.write("\nConnected to SMTP server successfully. Beginning dispatch...\n")

        success_count = 0
        error_count = 0

        try:
            for idx, r in enumerate(to_send, 1):
                email = r["email"]
                name = r["name"]
                body = self._personalize_body(template_text, name)

                name_str = f" to {name} <{email}>" if name else f" to <{email}>"
                self.stdout.write(f"[{idx}/{len(to_send)}] Sending{name_str}...", ending="")
                self.stdout.flush()

                try:
                    email_msg = EmailMessage(
                        subject=subject,
                        body=body,
                        from_email=from_email,
                        to=[email],
                        connection=connection,
                    )
                    email_msg.send(fail_silently=False)
                    self._append_sent_log(log_path, email, name)
                    self.stdout.write(self.style.SUCCESS(" OK"))
                    success_count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f" FAILED ({e})"))
                    error_count += 1

                # Rate limiting delay (only if there are more emails to send)
                if idx < len(to_send) and delay > 0:
                    time.sleep(delay)

        finally:
            try:
                connection.close()
            except Exception:
                pass

        self.stdout.write("\n" + "=" * 64)
        self.stdout.write(f"Dispatch Summary: {success_count} sent successfully, {error_count} failed.")
        self.stdout.write(f"State saved to  : {log_path}")
        self.stdout.write("=" * 64)
