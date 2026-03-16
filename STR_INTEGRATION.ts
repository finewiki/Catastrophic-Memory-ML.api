import Stripe from 'stripe';
import { env, logger } from './src/config';

/**
 * Service class handling all external payment and subscription
 * functionality. This abstraction provides a clean interface
 * over the Stripe SDK for the rest of the application.
 */
export class BillingService {
  private stripeClient: Stripe;
  private webhookSecret: string;
  private applicationUrl: string;

  constructor() {
    // Initialize the Stripe client with environment configuration
    this.stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
      appInfo: {
        name: 'CustomBillingService',
        version: '1.0.0'
      }
    });
    
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.applicationUrl = env.corsOrigin || 'http://localhost:4000';
  }

  /**
   * Generates a new checkout session for users purchasing a subscription.
   * 
   * @param accountId - The local database ID of the user.
   * @param planPriceId - The Stripe Price ID for the selected tier.
   */
  public async createSubscriptionCheckout(accountId: string, planPriceId: string): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripeClient.checkout.sessions.create({
        mode: 'subscription',
        customer_email: `user_${accountId}@system.local`, // Can be fetched from DB dynamically
        line_items: [
          {
            price: planPriceId,
            quantity: 1,
          },
        ],
        success_url: `${this.applicationUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.applicationUrl}/billing/cancel`,
        metadata: {
          accountId, // Preserved for webhook reconciliation
        },
      });
      
      logger.info(`Created new checkout session for account: ${accountId}`);
      return session;
    } catch (error) {
      logger.error(`Error generating checkout session: ${error}`);
      throw new Error('Failed to initialize billing session');
    }
  }

  /**
   * Bills an account for exceeding their allowed quota parameters.
   * Useful for dynamic usage-based overages.
   * 
   * @param accountId - The local database ID of the user.
   * @param amountInCents - The overage fee to be charged.
   */
  public async chargeOverage(accountId: string, amountInCents: number): Promise<Stripe.Invoice | null> {
    try {
      // NOTE: Here you would normally fetch the Stripe Customer ID associated with the accountId from your database.
      const targetCustomerId = 'cus_placeholder_id'; 
      
      // 1. Create an invoice item for the pending charge
      await this.stripeClient.invoiceItems.create({
        customer: targetCustomerId,
        amount: Math.round(amountInCents),
        currency: 'usd',
        description: 'Usage Overage Surcharge',
      });

      // 2. Draft and automatically finalize the invoice to trigger collection
      const invoice = await this.stripeClient.invoices.create({
        customer: targetCustomerId,
        auto_advance: true,
        collection_method: 'charge_automatically',
        metadata: { accountId, billingReason: 'overage' },
      });

      await this.stripeClient.invoices.finalizeInvoice(invoice.id);
      logger.info(`Overage of ${amountInCents} cents processed for account: ${accountId}`);
      
      return invoice;
    } catch (error) {
      logger.error(`Failed to process overage charge for ${accountId}: ${error}`);
      return null;
    }
  }

  /**
   * Express middleware/handler for consuming Stripe Webhook lifecycle events.
   * Ensures requests are cryptographically signed by Stripe.
   */
  public async handleWebhookEvent(req: any, res: any): Promise<void> {
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      res.status(400).send('Missing webhook signature');
      return;
    }

    let event: Stripe.Event;

    try {
      // Validates the raw body against the signature
      event = this.stripeClient.webhooks.constructEvent(
        req.body, 
        signature, 
        this.webhookSecret
      );
    } catch (err: any) {
      logger.error(`Webhook signature verification failed: ${err.message}`);
      res.status(400).send(`Webhook Verification Error: ${err.message}`);
      return;
    }

    // Process the validated event payload
    await this.processEvent(event);
    
    // Acknowledge receipt to prevent Stripe from retrying
    res.json({ received: true });
  }

  /**
   * Internal router for handling different validated Stripe event types.
   * Applies the necessary business logic to your database.
   */
  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const accountId = session.metadata?.accountId;
        logger.info(`Subscription successfully activated for account: ${accountId}`);
        // TODO: Mark user's subscription as active in DB
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info(`Invoice payment succeeded for account: ${invoice.metadata?.accountId}`);
        // TODO: Inform user of success / reset overage counters in DB
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.warn(`Invoice payment failed for account: ${invoice.metadata?.accountId}`);
        // TODO: Handle failed billing (e.g., downgrade tier, restrict access, or notify user)
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info(`Subscription cancelled and revoked for customer: ${subscription.customer}`);
        // TODO: Downgrade user account tier back to base level in DB
        break;
      }

      default:
        // Safely ignore events we don't handle natively
        break;
    }
  }
}

// Export a singleton instance for shared use throughout the application
export const billingService = new BillingService();
