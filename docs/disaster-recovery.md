# Disaster Recovery

Database backup strategy, disaster recovery procedures, and data protection for Meeting Intelligence Assistant.

---

## Table of Contents

- [Overview](#overview)
- [Current Backup Configuration](#current-backup-configuration)
- [Critical Data Inventory](#critical-data-inventory)
- [Recovery Procedures](#recovery-procedures)
- [Access Control](#access-control)
- [Recovery Objectives](#recovery-objectives)
- [Incident Response](#incident-response)
- [Future Enhancements](#future-enhancements)

---

## Overview

**Backup Strategy**: Automated daily backups via Supabase Pro with 7-day retention.

**Philosophy**: Rely on Supabase's managed backup infrastructure to reduce operational overhead and ensure reliable, encrypted, and tested backup procedures.

**Current Status**: ✅ Production backups verified and operational

### Key Decisions

1. **Daily Backups Only** - PITR (Point-in-Time Recovery) is available but not currently enabled due to cost ($100/month). Will be reconsidered when user base and revenue grow.

2. **7-Day Retention** - Supabase Pro provides 7 days of backup history. Longer retention available on higher-tier plans if needed in the future.

3. **No Custom Backup Scripts** - Leverage Supabase's built-in features rather than maintaining custom backup automation.

---

## Current Backup Configuration

### Supabase Production Settings

**Project ID**: `YOUR_PROJECT_ID`
**Plan**: Supabase Pro
**Backup Frequency**: Daily (automated)
**Retention Period**: 7 days
**Storage Location**: Supabase managed infrastructure (separate from production database)

### Enabled Features

✅ **Daily Automated Backups**

- Full PostgreSQL database dump (pg_dump format)
- Runs automatically once per day
- Stored on separate infrastructure from production
- Encrypted at rest

❌ **Point-in-Time Recovery (PITR)**

- Not currently enabled (cost: $100/month)
- Would allow restore to any second within last 7 days
- Deferred until user base and revenue grow

### Verification

To verify backup status:

1. Log into [Supabase Dashboard](https://supabase.com/dashboard/project/YOUR_PROJECT_ID)
2. Navigate to **Settings → Database → Backups**
3. Confirm "Daily Backups" shows as "Active"
4. Check "Last Backup" timestamp is within last 24 hours

---

## Critical Data Inventory

The following tables contain critical user data that must be protected:

### User & Authentication Data

| Table                  | Contains                                              | Criticality  |
| ---------------------- | ----------------------------------------------------- | ------------ |
| `users`                | User profiles, subscription status, trial eligibility | **Critical** |
| `calendar_credentials` | Encrypted OAuth tokens for calendar access            | **Critical** |
| `beta_users`           | Beta user whitelist                                   | **High**     |

### Meeting & Analysis Data

| Table               | Contains                                      | Criticality  |
| ------------------- | --------------------------------------------- | ------------ |
| `meetings`          | Meeting metadata, recordings, transcripts     | **Critical** |
| `meeting_analysis`  | AI-generated insights and behavioral analysis | **Critical** |
| `processing_jobs`   | Job history and status tracking               | **High**     |
| `anonymous_uploads` | Pre-signup meeting uploads                    | **Medium**   |

### Billing Data

| Table             | Contains                 | Criticality  |
| ----------------- | ------------------------ | ------------ |
| `subscriptions`   | Stripe subscription data | **Critical** |
| `payment_history` | Payment audit log        | **Critical** |

**Total**: 9 critical tables containing user data, meeting content, and financial records.

---

## Recovery Procedures

### Scenario 1: Accidental Data Deletion

**Use Case**: User accidentally deleted, wrong data modified, table truncated

**Recovery Time**: 15-30 minutes

**Procedure**:

1. **Assess the Damage**
   - Determine what data was lost
   - Identify when the deletion occurred (must be within last 7 days)

2. **Select Restore Point**
   - Log into [Supabase Dashboard](https://supabase.com/dashboard/project/YOUR_PROJECT_ID)
   - Navigate to **Settings → Database → Backups**
   - Review available backups (up to 7 days)
   - Select the most recent backup **before** the deletion occurred

3. **Initiate Restore**
   - Click "Restore" on the selected backup
   - ⚠️ **WARNING**: This will replace the current database entirely
   - Confirm restore operation
   - Wait for restore to complete (5-30 minutes depending on database size)

4. **Verify Restoration**

   ```sql
   -- Check row counts for critical tables
   SELECT 'users' as table_name, COUNT(*) FROM users
   UNION ALL
   SELECT 'meetings', COUNT(*) FROM meetings
   UNION ALL
   SELECT 'subscriptions', COUNT(*) FROM subscriptions;
   ```

5. **Notify Team**
   - Inform team of restore completion
   - Document what was lost (data between backup and restore)
   - Consider implementing safeguards to prevent recurrence

**Data Loss**: Up to 24 hours (time since last backup)

---

### Scenario 2: Database Corruption

**Use Case**: Database schema corruption, PostgreSQL errors, data integrity issues

**Recovery Time**: 30-60 minutes

**Procedure**:

1. **Identify Corruption Scope**
   - Check Supabase logs for errors
   - Determine if corruption is isolated or widespread
   - Take screenshots/logs for post-mortem

2. **Restore from Backup**
   - Follow steps in [Scenario 1](#scenario-1-accidental-data-deletion)
   - Choose most recent backup before corruption

3. **Investigate Root Cause**
   - Review recent migrations (see `supabase/migrations/`)
   - Check application logs for bad queries
   - Review [deployment.md](./deployment.md) for recent deployments

4. **Prevent Recurrence**
   - If caused by migration, fix and test locally
   - Update deployment safeguards if needed

---

### Scenario 3: Complete Database Loss (Catastrophic Failure)

**Use Case**: Supabase infrastructure failure, region outage, account compromise

**Recovery Time**: 1-2 hours

**Procedure**:

1. **Contact Supabase Support**
   - Email: support@supabase.com
   - Provide Project ID: `YOUR_PROJECT_ID`
   - Request emergency assistance

2. **Escalate Internally**
   - Notify all team members via Slack
   - Contact Supabase organization owners (see [Access Control](#access-control))
   - Document timeline for post-mortem

3. **Restore Options**
   - **Option A**: Supabase restores from their backups (preferred)
   - **Option B**: Create new Supabase project and restore from backup download
   - **Option C**: If all backups lost, coordinate with Supabase on recovery options

4. **Full System Recovery**
   - Update environment variables with new database URL
   - Redeploy all services (see [deployment.md](./deployment.md))
   - Verify all integrations (Stripe, AssemblyAI, etc.)
   - Test critical user flows

5. **Communication**
   - Notify users of any downtime or data loss
   - Provide timeline for full restoration
   - Post-mortem and remediation plan

---

## Access Control

### Supabase Organization Owners

**Required Role**: Owner (only owners can restore databases)

**Current Owners**: 2 team members

**Access Verification**:

1. Log into [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Organization Settings → Members**
3. Verify your role is listed as "Owner"

### Emergency Contact Procedure

If you need to restore the database but don't have Owner access:

1. **Slack**: Post in `#engineering` channel
2. **Email**: Contact owners directly
3. **Phone**: Use emergency contact list (stored in 1Password)

**On-Call Rotation**: Not currently implemented. All owners should monitor alerts.

---

## Recovery Objectives

### Recovery Point Objective (RPO)

**Current RPO**: **24 hours**

This is the maximum acceptable data loss. With daily backups, we could lose up to 24 hours of data if a disaster occurs right before the next backup.

**Future RPO** (with PITR enabled): **Near-zero** (down to the second)

### Recovery Time Objective (RTO)

**Current RTO**: **2 hours**

This is the target time to restore full service after a disaster:

- Database restore: 15-30 minutes
- Application verification: 30 minutes
- Full system testing: 30 minutes
- Buffer time: 30 minutes

**Downtime Impact**:

- Users cannot upload new meetings
- Existing meetings/analysis remain accessible during restore
- Authentication and subscriptions remain functional (Stripe/Supabase Auth separate)

---

## Incident Response

### Severity Levels

| Severity          | Definition                                    | Response Time | Example                                 |
| ----------------- | --------------------------------------------- | ------------- | --------------------------------------- |
| **P0 - Critical** | Production database unavailable               | Immediate     | Complete database failure               |
| **P1 - High**     | Data corruption/loss affecting multiple users | < 1 hour      | Accidental table deletion               |
| **P2 - Medium**   | Data integrity issue affecting single user    | < 4 hours     | Individual record corruption            |
| **P3 - Low**      | Backup verification failure                   | < 24 hours    | Missed backup (but database functional) |

### Escalation Path

1. **Initial Detection**
   - Automated alerts (if configured)
   - User reports
   - Manual discovery

2. **Triage** (5 minutes)
   - Assess severity level
   - Determine scope of impact
   - Alert team via Slack

3. **Response**
   - **P0/P1**: All hands on deck, follow recovery procedures immediately
   - **P2**: Assign owner, coordinate recovery during business hours
   - **P3**: Create ticket, address in next sprint

4. **Communication**
   - **Internal**: Slack `#engineering` for updates
   - **External**: Status page / email if affects users
   - **Post-Incident**: Post-mortem document in `/docs`

### Incident Checklist

When disaster strikes, follow this checklist:

- [ ] Assess damage and severity level
- [ ] Alert team via Slack `#engineering`
- [ ] Document incident timeline (screenshots, logs, timestamps)
- [ ] Determine restore point needed
- [ ] Log into Supabase Dashboard (verify Owner access)
- [ ] Initiate database restore
- [ ] Monitor restore progress
- [ ] Verify data integrity after restore
- [ ] Test critical user flows (auth, meeting upload, analysis)
- [ ] Notify users if needed
- [ ] Document data loss window
- [ ] Schedule post-mortem meeting
- [ ] Create follow-up tickets for prevention

---

## Future Enhancements

The following improvements are not currently implemented but may be considered as the product scales:

### 1. Point-in-Time Recovery (PITR)

**Status**: Not enabled (cost: $100/month)

**Benefits**:

- Restore to any second within last 7 days
- Near-zero data loss (RPO < 1 minute)
- Recover from accidental deletions minutes after they occur

**When to Enable**:

- User base > 100 active customers
- Monthly revenue > $2,000
- Critical data loss incident occurs

**Implementation**: Enable in Supabase Dashboard → Settings → Database → Backups

---

### 2. Off-Site Backup Copies

**Status**: Not implemented

**Benefits**:

- Additional redundancy outside Supabase infrastructure
- Protection against Supabase account compromise
- Long-term archival (> 7 days)

**Potential Solutions**:

- Export daily backups to Google Cloud Storage
- Custom script to download and archive pg_dump files
- Automated weekly exports to cold storage

**When to Implement**:

- After securing additional funding
- Regulatory compliance requirements
- Customer enterprise contracts requiring it

---

### 3. Quarterly Restore Testing

**Status**: Not scheduled

**Benefits**:

- Validate backups are functional
- Practice disaster recovery procedures
- Identify gaps in documentation

**Procedure**:

1. Create test Supabase project
2. Restore production backup to test project
3. Verify data integrity
4. Document any issues
5. Update disaster recovery procedures

**When to Implement**:

- After soft launch stabilizes
- Add to quarterly maintenance schedule

---

### 4. Automated Backup Monitoring

**Status**: Not implemented

**Benefits**:

- Proactive notification of backup failures
- Automated alerts if backup is > 24 hours old
- Integration with existing Sentry monitoring

**Potential Solutions**:

- Supabase webhook for backup events
- Daily cron job to check backup status via Supabase API
- Integrate with existing monitoring stack (Sentry)

**When to Implement**:

- Post-launch when monitoring infrastructure matures
- After implementing other Sentry integrations

---

### 5. Extended Retention (30+ Days)

**Status**: Not enabled

**Benefits**:

- Longer recovery window for historical data
- Meet enterprise customer requirements
- Better protection against delayed discovery of data issues

**Requirements**:

- Upgrade to Supabase Team plan ($599/month) or higher
- Custom backup solution to external storage

**When to Implement**:

- Enterprise customer requirements
- After revenue justifies higher Supabase tier

---

## Related Documentation

- [Database Schema & Migrations](./database.md) - Database structure and migration workflow
- [Deployment Guide](./deployment.md) - Deployment procedures and rollback strategies
- [Architecture Overview](./architecture.md) - System architecture and data flow
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

---

## Revision History

| Date       | Change                                  | Author |
| ---------- | --------------------------------------- | ------ |
| 2025-12-05 | Initial disaster recovery documentation | Tom    |

---

**Last Verified**: 2025-12-05
**Next Review**: 2026-03-05 (quarterly)
